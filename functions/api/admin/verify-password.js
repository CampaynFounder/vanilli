export async function onRequestPost(context) {
  const { request, env } = context;
  const adminPassword = env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return Response.json({ error: 'Admin password not configured' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { password } = body || {};

  if (password === adminPassword) {
    return Response.json({ success: true });
  }

  return Response.json({ error: 'Invalid password' }, { status: 401 });
}
