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
