# BestCity Market - Dev Preview

## Start Commands

Use the command style for your shell:

- Bash/WSL:
```bash
export NODE_OPTIONS=--max-old-space-size=8192
npx expo start --clear --tunnel
```

- PowerShell:
```powershell
$env:NODE_OPTIONS="--max-old-space-size=8192"
npx expo start --clear --tunnel
```

## Wallet Engine

- `WalletConnect` and `Base Smart` are both available in the unified wallet UI.
- Transactions (checkout, stock create, stock trade) follow the selected wallet engine automatically.
- On native builds, WalletConnect is the supported path by default.
