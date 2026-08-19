# SS.Red

Compartilhamento de tela em tempo real com HTML, CSS, JavaScript, WebRTC e WebSocket.

## Executar

```bash
cd server
npm install
npm start
```

Abra `http://localhost:3000` em duas abas ou navegadores. Em produção, use HTTPS/WSS para permitir captura de tela fora de localhost.

As salas vivem em memória e são removidas quando o último participante sai. Não há persistência de nicknames.

Substitua `assets/logo.png` para trocar a logo. Se o arquivo não existir, aparece o fallback `LOGO`.
