export async function api(path, init, request = fetch) {
  const response = await request(path, init);
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`Le serveur a renvoyé une réponse non JSON (HTTP ${response.status}). Vérifiez le déploiement des routes /api sur Vercel.`);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`Réponse JSON illisible du serveur (HTTP ${response.status}). Réessayez.`); }
  if (!response.ok) throw new Error(data.error || `La requête a échoué (HTTP ${response.status}).`);
  return data;
}
