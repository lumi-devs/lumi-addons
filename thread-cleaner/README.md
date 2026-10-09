# Thread Cleaner

Automatically archives or locks threads after a configurable period of inactivity.

## How it works

When a thread is created under one of the configured `enabled_channels`, a delayed cleanup task is scheduled for `inactive_duration` later. When the task fires, the thread is archived or locked per the configured `action`. State is tracked in KV.

## Configuration

- `enabled_channels`: Channels where new threads should be tracked for cleanup.
- `inactive_duration`: Duration of inactivity before cleanup runs (default: `3d`).
- `action`: Cleanup action to perform (`archive` or `lock`, default: `archive`).
