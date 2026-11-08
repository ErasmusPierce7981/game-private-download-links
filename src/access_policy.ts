export type Asset = {
  id: string;
  objectKey: string;
  ownerSessionId: string;
  kind: "player-asset" | "live-event" | "moderation-queue";
  state: "approved" | "live" | "pending" | "rejected" | "ended";
};

export function mayDownload(asset: Asset, sessionId: string): boolean {
  if (asset.ownerSessionId !== sessionId) return false;
  if (asset.kind === "player-asset") return asset.state === "approved";
  if (asset.kind === "live-event") return asset.state === "live";
  return false;
}

export function exampleAssets(ownerSessionId: string): Asset[] {
  return [
    { id: "avatar-42", objectKey: "players/42/avatar.png", ownerSessionId, kind: "player-asset", state: "approved" },
    { id: "replay-live", objectKey: "events/live/replay.mp4", ownerSessionId, kind: "live-event", state: "live" },
    { id: "clip-review", objectKey: "moderation/queue/clip.mp4", ownerSessionId, kind: "moderation-queue", state: "pending" },
  ];
}
