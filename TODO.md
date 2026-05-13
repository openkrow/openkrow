# Todo 
- Svg visualization tool
- Provider connections check
- Request connect when first time use app
- Find skill tools

## Actionable issues

- Forward `downloadProgress` in `mainview/rpc.ts` so first-launch opencode install progress updates the loading screen.
- Scope streaming UI updates by `sessionId` in `mainview/App.tsx` to prevent late events from one session appearing after switching chats.
- Preserve the selected model across settings refreshes in `components/ChatInput.tsx` instead of resetting to `opencode/big-pickle`.
- Replace shell-string installer commands in `bun/opencode-installer.ts` and `bun/skills.ts` with safer process/file APIs.
