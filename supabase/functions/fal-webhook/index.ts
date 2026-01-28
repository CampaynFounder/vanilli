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
  // Allow GET requests for health checks (returns status message)
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        service: "fal.ai webhook handler",
        status: "active",
        message: "This endpoint accepts POST requests from fal.ai webhooks only",
        method: "POST",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Only accept POST requests for actual webhooks
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST for webhooks." }), {
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
    gateway_request_id?: string;  // fal.ai webhook also sends this
    status?: string;
    video?: { url?: string } | string;
    response?: { video?: { url?: string } | string };
    payload?: { video?: { url?: string } | string };  // Webhook format uses payload field
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

  // fal.ai webhook sends both request_id and gateway_request_id
  // request_id is the queue ID (what we store), gateway_request_id is the last retry attempt
  // We should use request_id for matching, but fall back to gateway_request_id if needed
  const request_id = payload.request_id || payload.gateway_request_id;
  if (!request_id) {
    console.error("[fal-webhook] Missing request_id and gateway_request_id in payload:", JSON.stringify(payload, null, 2));
    return new Response(JSON.stringify({ error: "Missing request_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[fal-webhook] Received webhook - request_id: ${payload.request_id}, gateway_request_id: ${payload.gateway_request_id}, status: ${payload.status}`);
  console.log(`[fal-webhook] Using request_id for lookup: ${request_id}`);

  // Find the chunk by fal_request_id (which stores the fal.ai request_id from initial response)
  // Try request_id first, then gateway_request_id as fallback
  let chunk: {
    id: string;
    job_id: string;
    generation_id: string | null;
    chunk_index: number;
    status: string;
    fal_request_id: string | null;
  } | null = null;
  let findError: any = null;
  
  if (payload.request_id) {
    console.log(`[fal-webhook] Searching for chunk with fal_request_id = '${payload.request_id}'`);
    const result = await supabase
      .from("video_chunks")
      .select("id, job_id, generation_id, chunk_index, status, fal_request_id")
      .eq("fal_request_id", payload.request_id)
      .maybeSingle();
    chunk = result.data;
    findError = result.error;
    
    if (chunk) {
      console.log(`[fal-webhook] ✓ Found chunk: id=${chunk.id}, chunk_index=${chunk.chunk_index}, job_id=${chunk.job_id}`);
    } else {
      console.log(`[fal-webhook] ✗ No chunk found with fal_request_id = '${payload.request_id}'`);
      if (findError) {
        console.error(`[fal-webhook] Database error:`, findError);
      }
    }
  }
  
  // If not found and we have gateway_request_id, try that too
  if (!chunk && payload.gateway_request_id && payload.gateway_request_id !== payload.request_id) {
    console.log(`[fal-webhook] request_id not found, trying gateway_request_id: ${payload.gateway_request_id}`);
    const result = await supabase
      .from("video_chunks")
      .select("id, job_id, generation_id, chunk_index, status, fal_request_id")
      .eq("fal_request_id", payload.gateway_request_id)
      .maybeSingle();
    chunk = result.data;
    findError = result.error;
    
    if (chunk) {
      console.log(`[fal-webhook] ✓ Found chunk with gateway_request_id: id=${chunk.id}, chunk_index=${chunk.chunk_index}`);
    } else {
      console.log(`[fal-webhook] ✗ No chunk found with gateway_request_id = '${payload.gateway_request_id}'`);
    }
  }

  // Debug: List recent chunks to see what fal_request_ids exist
  if (!chunk) {
    console.log(`[fal-webhook] DEBUG: Checking recent chunks to see what fal_request_ids are stored...`);
    const recentChunks = await supabase
      .from("video_chunks")
      .select("id, chunk_index, fal_request_id, status, job_id")
      .order("created_at", { ascending: false })
      .limit(10);
    
    if (recentChunks.data && recentChunks.data.length > 0) {
      console.log(`[fal-webhook] Recent chunks (last 10):`);
      recentChunks.data.forEach((c: any) => {
        console.log(`  - chunk_index=${c.chunk_index}, fal_request_id='${c.fal_request_id}', status=${c.status}, job_id=${c.job_id}`);
      });
    } else {
      console.log(`[fal-webhook] No recent chunks found in database`);
    }
  }

  if (findError || !chunk) {
    console.error(
      `[fal-webhook] Chunk not found for request_id ${request_id}:`,
      findError
    );
    console.error(`[fal-webhook] Full payload:`, JSON.stringify(payload, null, 2));
    // Return 200 to prevent fal.ai from retrying
    return new Response(JSON.stringify({ received: true, message: "Chunk not found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const status = payload.status;
  const now = new Date().toISOString();

  // fal.ai webhook can send "OK" for successful requests or "COMPLETED" for queue-based requests
  if (status === "COMPLETED" || status === "OK") {
    // Extract video URL from fal.ai response
    // Format can be: {"payload": {"video": {"url": "..."}}} (webhook format)
    // or {"response": {"video": {"url": "..."}}} (queue result format)
    // or {"video": {"url": "..."}} (direct format)
    let video_url: string | undefined;
    const payload_data = payload.payload || {};
    const response_data = payload.response || {};
    const video_data = payload_data.video || response_data.video || payload.video;

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
