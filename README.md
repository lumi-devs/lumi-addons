# Lumi Addons

<p align="center">
  <a href="https://github.com/lumi-devs/lumi-addons/actions"><img src="https://img.shields.io/github/actions/workflow/status/lumi-devs/lumi-addons/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3+-black?style=flat-square&logo=bun" alt="Bun"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-green?style=flat-square" alt="AGPL v3"></a>
</p>

Optional addon modules for [Lumi](https://github.com/lumi-devs/lumi). Drop them into your bot to add extra features without touching core.

---

## Available Addons

| Addon | What it does |
| :--- | :--- |
| [`activity-roles`](./activity-roles) | Auto-assigns roles based on Discord Rich Presence |
| [`booster-roles`](./booster-roles) | Custom booster role creation with color picker |
| [`confessions`](./confessions) | Anonymous confessions with thread discussions |
| [`dragme`](./dragme) | Consent-based voice move requests |
| [`multi-lounge`](./multi-lounge) | Auto-scaling dynamic voice channels |
| [`promoter`](./promoter) | Rewards members who feature the server tag in their status |
| [`rolementions`](./rolementions) | Mention tracking & ghost-ping logging |
| [`status`](./status) | Rotating bot presence switcher |
| [`thread-cleaner`](./thread-cleaner) | Automated stale thread archiver/locker |
| [`utility`](./utility) | Auto-translation, emoji stealer |
| [`verify`](./verify) | Captcha verification with raid protection |

## Installing an Addon

Run these commands inside Discord (with Lumi running):

```
,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git
,download lumi-addons <addon-name>
```

No restart needed. The addon loads hot.

## Local Development

```bash
git clone https://github.com/lumi-devs/lumi-addons.git
cd lumi-addons
bun install
bun run typecheck
bun run lint
```

## License

[AGPL v3](LICENSE) — modified versions run publicly must share source.
