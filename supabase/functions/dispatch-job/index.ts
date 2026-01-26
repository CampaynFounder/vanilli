import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const modalAnalyzerUrl = Deno.env.get("MODAL_ANALYZER_URL");

  if (!supabaseUrl || !supabaseService || !modalAnalyzerUrl) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: { record?: { id?: string; user_video_url?: string; master_audio_url?: string; tier?: string } };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const record = body.record;
  if (!record?.id || !record.user_video_url || !record.master_audio_url) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const jobId = record.id;
  const tier = record.tier || "open_mic";

  // Only dispatch to analyzer for DEMO/Industry tiers (need tempo analysis)
  const needsAnalysis = tier === "demo" || tier === "industry";

  if (needsAnalysis) {
    try {
      // Dispatch to Modal Analyzer
      const analyzerResponse = await fetch(modalAnalyzerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          video: record.user_video_url,
          audio: record.master_audio_url,
        }),
      });

      if (!analyzerResponse.ok) {
        const errorText = await analyzerResponse.text();
        console.error(`[dispatch] Analyzer error: ${analyzerResponse.status} ${errorText}`);
        // Update job status to failed
        const supabase = createClient(supabaseUrl, supabaseService);
        await supabase.table("video_jobs").update({
          analysis_status: "FAILED",
          status: "FAILED",
          error_message: `Analysis failed: ${errorText}`,
        }).eq("id", jobId).execute();
      }

      return new Response(JSON.stringify({ status: "Dispatched to analyzer" }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("[dispatch] Error dispatching to analyzer:", e);
      const supabase = createClient(supabaseUrl, supabaseService);
      await supabase.table("video_jobs").update({
        analysis_status: "FAILED",
        status: "FAILED",
        error_message: `Dispatch failed: ${e}`,
      }).eq("id", jobId).execute();

      return new Response(JSON.stringify({ error: "Failed to dispatch" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  } else {
    // Lower tiers don't need analysis - mark as analyzed immediately
    const supabase = createClient(supabaseUrl, supabaseService);
    await supabase.table("video_jobs").update({
      analysis_status: "ANALYZED",
      status: "ANALYZED",
      sync_offset: 0.0,  // No offset needed for single-chunk jobs
      chunk_duration: 9.0,  // Fixed 9s chunks for lower tiers
    }).eq("id", jobId).execute();

    return new Response(JSON.stringify({ status: "Marked as analyzed (no analysis needed)" }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
