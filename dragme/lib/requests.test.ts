import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRequest, setRequest, deleteRequest } from "./requests.js";
import { REQUEST_KEY, type DragRequestRecord } from "../keys.js";

const mockKv = {
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
};

vi.mock("lumi/kv", () => ({
  get: (...args: unknown[]) => mockKv.get(...args),
  set: (...args: unknown[]) => mockKv.set(...args),
  remove: (...args: unknown[]) => mockKv.remove(...args),
}));

describe("dragme requests kv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const record: DragRequestRecord = {
    requestId: "req-123",
    guildId: "guild-1",
    requesterId: "user-1",
    targetUserId: "user-2",
    channelId: "vc-1",
    cardChannelId: "tc-1",
    cardMessageId: "msg-1",
    status: "pending",
    createdAt: 1000,
    expiresAt: 5000,
  };

  it("gets request by id", async () => {
    mockKv.get.mockResolvedValueOnce(record);
    const res = await getRequest("guild-1", "req-123");
    expect(mockKv.get).toHaveBeenCalledWith("guild-1", "req-123", REQUEST_KEY);
    expect(res).toEqual(record);
  });

  it("sets request by id", async () => {
    mockKv.set.mockResolvedValueOnce(undefined);
    await setRequest(record);
    expect(mockKv.set).toHaveBeenCalledWith("guild-1", "req-123", REQUEST_KEY, record);
  });

  it("deletes request by id", async () => {
    mockKv.remove.mockResolvedValueOnce(1);
    await deleteRequest("guild-1", "req-123");
    expect(mockKv.remove).toHaveBeenCalledWith("guild-1", "req-123", REQUEST_KEY);
  });
});
