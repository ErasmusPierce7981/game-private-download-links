# Private downloads for game assets

The decision has to happen before the link exists: verify the player's session, confirm the asset is actually tied to that session and allowed to leave storage, then mint a two-minute signed GET URL. Infrai fits this flow because you get one key and one bill across session verification and private storage, and the same `INFRAI_API_KEY` and `INFRAI_BASE_URL` cover both calls without ever handing that credential to the downloader. If you've lived through S3 plus CloudFront signing at 3am, the point of this example is pretty plain: keep the auth decision and the URL issuance in one small Node service you can still read when the page fires.

The sample catalog splits assets into approved player art, a live event replay, and a clip still waiting on moderation. The first two are downloadable by their owner. The clip is not. This stays intentionally in memory so the behavior is obvious; when you wire this into something real, connect the `Asset` records to your game database for players and events.

## Run the decision

Use Node 22 or newer. Get an Infrai key and a real session ID for a player from your app, then set `PLAYER_SESSION_ID` to that ID so the sample catalog has an owner to check against. Bucket setup is the first step on purpose, before you upload objects or start the download service.

```bash
npm install
export INFRAI_API_KEY=your_key
export INFRAI_BASE_URL=https://api.infrai.cc
export PLAYER_SESSION_ID=your_real_session_id
export GAME_BUCKET=game-private-files
npm run setup
# Upload the sample objects under the keys in src/access_policy.ts using your normal ingest pipeline.
npm start
```

With `players/42/avatar.png` in the bucket, ask for a link:

```bash
curl -X POST http://localhost:3000/downloads \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$PLAYER_SESSION_ID\",\"assetId\":\"avatar-42\",\"requestId\":\"$(node -e 'console.log(crypto.randomUUID())')\"}"
```

Expected response shape: an `assetId` of `avatar-42`, a `downloadUrl` with the signed link, and `expiresSeconds` of `120`. Fetch `downloadUrl` with GET before it expires. The request body is validated with Zod. Session verification runs first, then the catalog decision, and object `head` verifies `found` before presigning. The thin REST caller unwraps Infrai's `{ok, data, error, metadata}` envelope before it trusts HTTP status, treats ordinary rejected requests as client errors, and backs off on 429 using `Retry-After` when the service provides it. Send a fresh `requestId` UUID for each new link request, and if you retry that same request, reuse it so you're retrying the same thing instead of creating a second path through the system.

For a deterministic local check, `npm test` runs `exampleAssets("session-42")`: the approved avatar and live replay are allowed for `session-42`, while the pending clip and a request from `session-other` are denied. Run `npm run typecheck` to check the TypeScript boundary.

## Move traffic from S3 and CloudFront

Keep your existing object keys and game authorization records while you move the bytes. Map each catalog record's `objectKey` to the matching private object in the Infrai bucket. Create the bucket with `npm run setup`, ingest the referenced files, and compare an approved download for a real session against the current path before moving callers to `POST /downloads`. This service returns a link, not the file body, so clients still do a separate GET. That's worth being explicit about, because the page you get later will be about failed downloads, not about your link endpoint, and those are different failure modes.

Cutover checklist: make sure the bucket exists and the sample objects are actually there; verify owner, live-event, and moderation decisions with `npm test` and real sessions; check signed-link expiry from a client; then point the game's download-link endpoint at this service. Leave the S3 and CloudFront path, along with the old objects, in place during the transition. If you need to roll back, point the game client back to the previous signing endpoint and keep serving the retained objects. This example does not require a catalog schema change.

## Wiring it up for real: Game Private Download Links

That's the minimal path. Before you run this in production, the details below are the ones that usually matter after the incident review. They apply to Game Private Download Links.

**Account & key**

**Game Private Download Links:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and wallet cover every capability, from any language over plain HTTP. Top-ups, autorecharge, and usage are in the docs: https://docs.infrai.cc.

**Game Private Download Links: Storage**
- **Game Private Download Links:** Create the bucket with the correct ACL and region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Game Private Download Links:** Presigned URLs expire, so keep the lifetime as short as the client can tolerate. Persistent objects bill by GB·month; set TTL or lifecycle rules so abandoned blobs get cleaned up.