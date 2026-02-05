/**
 * Recheck Generation Completion
 *
 * Lets the customer request a recheck of completion status (e.g. after webhook missed).
 * Active after 10 minutes, rate-limited to 3 requests per generation.
 * Requires FAL_API_KEY in Edge Function secrets.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const FAL_BASE = "https://queue.fal.run";
const FAL_MODEL = "kling-video/v2.6";
const ELIGIBLE_AFTER_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REFRESH_CLICKS = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Sign in to continue" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const falApiKey = Deno.env.get("FAL_API_KEY");

  if (!supabaseUrl || !supabaseAnon || !supabaseService) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!falApiKey) {
    return new Response(JSON.stringify({ error: "Recheck not configured" }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnon);
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
  if (authErr || !user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: { generation_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const generationId = body.generation_id;
  if (!generationId) {
    return new Response(JSON.stringify({ error: "Missing generation_id" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseService);

  // Resolve generation and verify ownership (via video_jobs or projects)
  const { data: gen, error: genErr } = await supabase
    .from("generations")
    .select("id, project_id, status, cost_credits, created_at, refresh_requests_count")
    .eq("id", generationId)
    .single();
  if (genErr || !gen) {
    return new Response(JSON.stringify({ error: "Generation not found" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const genRow = gen as { project_id?: string | null };
  const { data: vj } = await supabase
    .from("video_jobs")
    .select("user_id")
    .eq("generation_id", generationId)
    .maybeSingle();
  const { data: proj } = genRow.project_id
    ? await supabase.from("projects").select("user_id").eq("id", genRow.project_id).maybeSingle()
    : { data: null };
  const ownerId = (vj as { user_id?: string } | null)?.user_id ?? (proj as { user_id?: string } | null)?.user_id;
  if (ownerId !== user.id) {
    return new Response(JSON.stringify({ error: "Not allowed" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const status = (gen as { status: string }).status;
  const costCredits = (gen as { cost_credits?: number }).cost_credits ?? 0;
  const createdAt = (gen as { created_at?: string }).created_at;
  const refreshCount = (gen as { refresh_requests_count?: number }).refresh_requests_count ?? 0;

  if (status !== "processing" && status !== "pending") {
    return new Response(JSON.stringify({ error: "Generation is not in progress" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (costCredits <= 0) {
    return new Response(JSON.stringify({ error: "No credits deducted for this generation" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const ageMs = createdAt ? Date.now() - new Date(createdAt).getTime() : 0;
  if (ageMs < ELIGIBLE_AFTER_MS) {
    return new Response(
      JSON.stringify({
        error: "Refresh available after 10 minutes",
        eligible_in_seconds: Math.ceil((ELIGIBLE_AFTER_MS - ageMs) / 1000),
      }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
  if (refreshCount >= MAX_REFRESH_CLICKS) {
    return new Response(JSON.stringify({ error: "Refresh limit reached (3 per generation)" }), {
      status: 429,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Increment refresh count
  const { error: incErr } = await supabase
    .from("generations")
    .update({ refresh_requests_count: refreshCount + 1 })
    .eq("id", generationId)
    .select()
    .single();
  if (incErr) {
    return new Response(JSON.stringify({ error: "Could not update refresh count" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Chunks for this generation that are PROCESSING and have fal_request_id
  const { data: chunks, error: chunksErr } = await supabase
    .from("video_chunks")
    .select("id, job_id, fal_request_id, chunk_index")
    .eq("generation_id", generationId)
    .eq("status", "PROCESSING")
    .not("fal_request_id", "is", null);
  if (chunksErr) {
    return new Response(JSON.stringify({ error: "Could not load chunks" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const list = (chunks || []) as { id: string; job_id: string; fal_request_id: string; chunk_index: number }[];
  const nowIso = new Date().toISOString();

  for (const chunk of list) {
    const rid = chunk.fal_request_id;
    try {
      const statusRes = await fetch(`${FAL_BASE}/${FAL_MODEL}/requests/${rid}/status`, {
        headers: { Authorization: `Key ${falApiKey}` },
      });
      if (!statusRes.ok) continue;
      const statusJson = await statusRes.json();
      const falStatus = statusJson.status;
      if (falStatus === "COMPLETED") {
        const resultRes = await fetch(`${FAL_BASE}/${FAL_MODEL}/requests/${rid}`, {
          headers: { Authorization: `Key ${falApiKey}` },
        });
        if (!resultRes.ok) continue;
        const resultJson = await resultRes.json();
        const resp = resultJson.response || {};
        const videoData = resp.video ?? resultJson.video;
        let videoUrl: string | null = null;
        if (typeof videoData === "string") videoUrl = videoData;
        else if (videoData?.url) videoUrl = videoData.url;
        if (videoUrl) {
          await supabase
            .from("video_chunks")
            .update({
              status: "COMPLETED",
              kling_video_url: videoUrl,
              kling_completed_at: nowIso,
            })
            .eq("id", chunk.id)
            .then(() => {});
        }
      } else if (falStatus === "FAILED") {
        const errMsg = statusJson.error?.message ?? statusJson.error ?? "fal.ai failed";
        await supabase
          .from("video_chunks")
          .update({
            status: "FAILED",
            error_message: `fal.ai: ${errMsg}`,
            kling_completed_at: nowIso,
          })
          .eq("id", chunk.id)
          .then(() => {});
      }
    } catch (_) {
      // Skip chunk on error, continue with others
    }
  }

  const jobId = list.length > 0 ? list[0].job_id : null;
  if (jobId) {
    const { data: allChunks } = await supabase
      .from("video_chunks")
      .select("id, status, kling_video_url")
      .eq("job_id", jobId);
    const all = (allChunks || []) as { status: string; kling_video_url?: string }[];
    const allCompleted = all.length > 0 && all.every((c) => c.status === "COMPLETED");
    const firstUrl = all.find((c) => c.status === "COMPLETED" && c.kling_video_url)?.kling_video_url;
    if (allCompleted && firstUrl) {
      await supabase.from("video_jobs").update({
        status: "COMPLETED",
        output_url: firstUrl,
        completed_at: nowIso,
      }).eq("id", jobId).then(() => {});
      await supabase.from("generations").update({ status: "completed" }).eq("id", generationId).then(() => {});
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
