import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * fal.ai Webhook Handler
 * 
 * Receives webhook callbacks from fal.ai when video generation completes.
 * Updates the corresponding video_chunk record with the result.
 * 
 * Webhook URL format: https://<project-ref>.supabase.co/functions/v1/fal-webhook
 * 
 * Configure in fal.ai: Pass webhookUrl when submitting requests via queue.submit()
 */

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let payload: {
    request_id?: string;
    status?: string;
    video?: { url?: string } | string;
    response?: { video?: { url?: string } | string };
    error?: { message?: string } | string;
  };

  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const request_id = payload.request_id;
  if (!request_id) {
    console.error("[fal-webhook] Missing request_id in payload:", payload);
    return new Response(JSON.stringify({ error: "Missing request_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[fal-webhook] Received webhook for request_id: ${request_id}, status: ${payload.status}`);

  // Find the chunk by kling_task_id (which stores the fal.ai request_id)
  const { data: chunk, error: findError } = await supabase
    .from("video_chunks")
    .select("id, job_id, generation_id, chunk_index, status")
    .eq("kling_task_id", request_id)
    .single();

  if (findError || !chunk) {
    console.error(
      `[fal-webhook] Chunk not found for request_id ${request_id}:`,
      findError
    );
    // Return 200 to prevent fal.ai from retrying
    return new Response(JSON.stringify({ received: true, message: "Chunk not found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const status = payload.status;
  const now = new Date().toISOString();

  if (status === "COMPLETED") {
    // Extract video URL from fal.ai response
    // Format can be: {"video": {"url": "..."}} or {"response": {"video": {"url": "..."}}}
    let video_url: string | undefined;
    const response_data = payload.response || {};
    const video_data = response_data.video || payload.video;

    if (video_data) {
      if (typeof video_data === "string") {
        video_url = video_data;
      } else if (typeof video_data === "object" && video_data.url) {
        video_url = video_data.url;
      }
    }

    if (!video_url) {
      console.error(`[fal-webhook] No video URL in payload for request_id ${request_id}`);
      // Update chunk as failed
      await supabase
        .from("video_chunks")
        .update({
          status: "FAILED",
          error_message: "fal.ai webhook: No video URL in response",
          kling_completed_at: now,
        })
        .eq("id", chunk.id)
        .execute();

      return new Response(
        JSON.stringify({ received: true, error: "No video URL" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Update chunk with completed status and video URL
    const { error: updateError } = await supabase
      .from("video_chunks")
      .update({
        status: "COMPLETED",
        kling_video_url: video_url,
        kling_completed_at: now,
        // Note: video_url (final muxed URL) will be set by worker_loop after muxing
        // This kling_video_url is the raw Kling output
      })
      .eq("id", chunk.id)
      .execute();

    if (updateError) {
      console.error(
        `[fal-webhook] Failed to update chunk ${chunk.id}:`,
        updateError
      );
      return new Response(
        JSON.stringify({ received: true, error: "Update failed" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `[fal-webhook] Successfully updated chunk ${chunk.id} (chunk_index: ${chunk.chunk_index}) with video URL`
    );

    // Trigger worker_loop to continue processing (muxing, etc.)
    // The worker_loop will poll for COMPLETED chunks and process them
    // Alternatively, we could trigger a Modal function here, but polling is simpler

    return new Response(JSON.stringify({ received: true, success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } else if (status === "FAILED") {
    // Extract error message
    let error_message = "fal.ai video generation failed";
    const error_data = payload.error;
    if (error_data) {
      if (typeof error_data === "string") {
        error_message = error_data;
      } else if (typeof error_data === "object" && error_data.message) {
        error_message = error_data.message;
      }
    }

    // Update chunk as failed
    const { error: updateError } = await supabase
      .from("video_chunks")
      .update({
        status: "FAILED",
        error_message: `fal.ai: ${error_message}`,
        kling_completed_at: now,
      })
      .eq("id", chunk.id)
      .execute();

    if (updateError) {
      console.error(
        `[fal-webhook] Failed to update chunk ${chunk.id} as failed:`,
        updateError
      );
    }

    console.log(
      `[fal-webhook] Marked chunk ${chunk.id} (chunk_index: ${chunk.chunk_index}) as FAILED: ${error_message}`
    );

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } else {
    // IN_QUEUE, IN_PROGRESS, etc. - just acknowledge
    console.log(
      `[fal-webhook] Received status ${status} for request_id ${request_id}, chunk ${chunk.id}`
    );
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
