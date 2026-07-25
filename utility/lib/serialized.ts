import { AsyncQueue } from "@sapphire/async-queue";

const queues = new Map<string, AsyncQueue>();

function queueFor(key: string): AsyncQueue {
  let queue = queues.get(key);
  if (!queue) queues.set(key, (queue = new AsyncQueue()));
  return queue;
}

/** Serialize async work behind a stable key without repeating queue boilerplate. */
export async function withSerializedWork<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const queue = queueFor(key);
  await queue.wait();
  try {
    return await fn();
  } finally {
    queue.shift();
  }
}