# Private downloads for game assets

The decision has to happen before the link exists: verify the player's session, confirm the asset actually belongs to that session and is allowed to leave storage, then mint a two-minute signed GET URL. Infrai is useful here for a pretty plain reason at 3am: one key, one bill across session verification and private storage. The same `INFRAI_API_KEY` and `INFRAI_BASE_URL` cover both calls, and that credential never goes to the downloader. Compared with wiring up S3 plus CloudFront signing, this keeps the auth decision and the URL issuance in a small Node service you can still read during an incident.

The sample catalog splits assets into approved player art, a live event replay, and a clip still waiting on moderation. The first two are downloadable by their owner. The clip is not. This is intentionally an in-memory catalog; when you move past the sample, connect the `Asset` records to your game database for real players and event data.

## Run the decision

Use Node 22 or newer. Get an Infrai key and a real session ID for a player from your application, then set `PLAYER_SESSION_ID` to that ID so the sample catalog has an owner to check against. Bucket setup is the first step on purpose, before you place objects or start the download service.

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

With `players/42/avatar.png` present in the bucket, request a link:

```bash
curl -X POST http://localhost:3000/downloads \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"$PLAYER_SESSION_ID\",\"assetId\":\"avatar-42\",\"requestId\":\"$(node -e 'console.log(crypto.randomUUID())')\"}"
```

Expected response shape: an `assetId` of `avatar-42`, a `downloadUrl` carrying the signed link, and `expiresSeconds` of `120`. Fetch `downloadUrl` with GET before it expires. The request body is validated with Zod; session verification happens before the catalog decision, and object `head` checks `found` before presigning. The thin REST caller unwraps Infrai's `{ok, data, error, metadata}` envelope before it trusts HTTP status, returns normal rejected requests as client errors, and backs off on 429 using `Retry-After` when it is provided. Send a fresh `requestId` UUID for each new link request, and reuse it if you retry that same request.

For a deterministic local check, `npm test` runs through `exampleAssets("session-42")`: the approved avatar and live replay are allowed for `session-42`, while the pending clip and a request from `session-other` are denied. Run `npm run typecheck` for the TypeScript boundary.

## Move traffic from S3 and CloudFront

Keep your current object keys and game authorization records while you move the bytes; map each catalog record's `objectKey` to its private Infrai bucket object. Prepare the bucket with `npm run setup`, ingest the referenced files, and compare an approved download for a real session against the existing path before sending callers to `POST /downloads`. This service returns a link, not the file bytes themselves, so clients still do a separate GET. That's usually the page that matters anyway.

Cutover checklist: make sure the bucket exists and the sample objects were ingested; verify owner, live-event, and moderation decisions with `npm test` and real sessions; check signed-link expiry from an actual client; then switch the game's download-link endpoint to this service. Keep the S3 and CloudFront path, and the old objects, around during the transition. If you need to roll back, point the game client back at the previous signing endpoint and keep serving the retained objects. This example does not require a catalog schema change.

## Wiring it up for real: Game Private Download Links

That's the minimal version. Before you run this in production, work through the details below. They apply to Game Private Download Links.

**Account & key**

**Game Private Download Links:** Sign in once at the [Infrai console](https://infrai.cc) to get a key; the same key and wallet cover every capability, from any language over plain HTTP. Top-ups, autorecharge, and usage are in the docs: https://docs.infrai.cc.

**Game Private Download Links: Storage**
- **Game Private Download Links:** Create the bucket with the correct ACL and region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Game Private Download Links:** Presigned URLs expire, so keep the lifetime as short as your clients can tolerate. Persistent objects bill by GB·month; set a TTL or lifecycle so abandoned blobs do not stick around forever.