[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/Agus12341/shadow-ledger/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/Agus12341/shadow-ledger/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

# Shadow Ledger

A tiny top-down stealth game for make.fun's "Make the best stealth game" bounty.
Sneak past patrolling guards and their vision cones, hide crouched in the shadows,
mind the lamplight and your own noise, steal the gold in three handcrafted vaults
and slip out the exit unseen.

## Run it

```sh
node serve.ts        # then open http://localhost:8080
```

Move with WASD or the arrow keys, hold SHIFT to sneak and hide, R retries a vault.
The game is plain static files under `game/` — no build step, no network requests.
`node main.ts` (with `MAKEFUN_OUTPUT_DIR` set) assembles the entry output:
the game, its screenshots and `dossier.json`.

MIT licensed — see LICENSE.
