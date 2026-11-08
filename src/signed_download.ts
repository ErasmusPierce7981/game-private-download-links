import { createServer } from "node:http";
import { z } from "zod";
import { exampleAssets, mayDownload } from "./access_policy.ts";
import { infrai, InfraiError } from "./infrai_rest.ts";

const bucket = process.env.GAME_BUCKET ?? "game-private-files";
const requestBody = z.object({ sessionId: z.string().min(1), assetId: z.string().min(1), requestId: z.string().uuid() }).strict();

if (process.argv[2] === "setup") {
  await infrai.storage.bucket.create(bucket);
  console.log(`Created bucket ${bucket}`);
} else {
  const owner = process.env.PLAYER_SESSION_ID;
  if (!owner) throw new Error("Set PLAYER_SESSION_ID to a session ID for the sample catalog");
  const assets = exampleAssets(owner);
  createServer(async (req, res) => {
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.method !== "POST" || req.url !== "/downloads") return send(404, { error: "Not found" });
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 8192) return send(413, { error: "Body too large" });
      }
      const parsed = requestBody.safeParse(JSON.parse(raw));
      if (!parsed.success) return send(400, { error: "Expected sessionId, assetId and UUID requestId" });
      const { sessionId, assetId, requestId } = parsed.data;
      await infrai.auth.session.verify(sessionId);
      const asset = assets.find(item => item.id === assetId);
      if (!asset || !mayDownload(asset, sessionId)) return send(403, { error: "Asset unavailable" });
      const object = await infrai.storage.object.head(bucket, asset.objectKey);
      if (!object.found) return send(404, { error: "Object not found" });
      const signed = await infrai.storage.object.presign(bucket, asset.objectKey, requestId);
      return send(200, { assetId: asset.id, downloadUrl: signed.url, expiresSeconds: 120 });
    } catch (error) {
      if (error instanceof SyntaxError) return send(400, { error: "Invalid JSON" });
      if (error instanceof InfraiError) return send(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code });
      return send(502, { error: "Could not issue download link" });
    }
  }).listen(Number(process.env.PORT ?? 3000), () => console.log("Download service listening on port " + (process.env.PORT ?? 3000)));
}
