export async function onRequestGet(context) {
  const { request, env } = context;
  const authHeader = request.headers.get('Authorization');
  const adminPassword = env.ADMIN_PASSWORD;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;

  if (!adminPassword) {
    return Response.json({ error: 'Admin password not configured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${adminPassword}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    return Response.json(
      { error: 'Database not configured. Set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL.' },
      { status: 500 }
    );
  }

  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/email_collections?select=*&order=created_at.desc`;
  const res = await fetch(url, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: err || res.statusText }, { status: 500 });
  }

  const items = await res.json();
  const total = items?.length ?? 0;

  const now = new Date();
  const last24Hours = (items ?? []).filter((item) => {
    const itemDate = new Date(item.created_at);
    const diffHours = (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60);
    return diffHours <= 24;
  }).length;

  const investors = (items ?? []).filter((item) => item.is_investor === true);

  const weeklyTrend = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const count = (items ?? []).filter((item) => {
      const itemDate = new Date(item.created_at);
      return itemDate >= date && itemDate < nextDate;
    }).length;

    weeklyTrend.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count,
    });
  }

  return Response.json({
    data: items ?? [],
    total,
    last24Hours,
    investors,
    weeklyTrend,
  });
}
