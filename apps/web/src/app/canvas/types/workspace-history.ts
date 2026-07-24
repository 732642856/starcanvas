export type WorkspaceHistoryEventType =
  | "document-uploaded"
  | "node-created"
  | "story-generated"
  | "storyboard-generated"
  | "shots-split"
  | "image-generated"
  | "video-workflow-created"
  | "snapshot-created"
  | "snapshot-restored";

export type WorkspaceHistoryEvent = {
  id: string;
  type: WorkspaceHistoryEventType;
  title: string;
  summary?: string;
  nodeId?: string;
  relatedNodeIds?: string[];
  snapshotId?: string;
  createdAt: string;
};

export type WorkspaceHistoryStorage = {
  version: 1;
  events: WorkspaceHistoryEvent[];
};
