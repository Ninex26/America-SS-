# DuArrasta

Compartilhamento de tela em tempo real com HTML, CSS, JavaScript, WebRTC e WebSocket.

## Executar localmente

```bash
npm install
npm start
```

Abra `http://localhost:3000` em duas abas ou navegadores.

## Deploy na Railway

1. Envie este projeto para um repositório no GitHub, incluindo `package.json`, `package-lock.json` e `server.js` na raiz.
2. Na Railway, escolha **New Project > Deploy from GitHub Repo**.
3. Selecione o repositório e mantenha o diretório raiz como `/`.
4. Use `npm install` no build e `npm start` no start command, caso a Railway não detecte automaticamente.
5. Gere um domínio público em **Settings > Networking > Generate Domain**.

A aplicação usa automaticamente `process.env.PORT` e atende HTTP e WebSocket pela mesma porta. Em produção, a URL deve ser HTTPS para que o navegador permita o compartilhamento de tela.

As salas vivem em memória e são removidas quando o último participante sai. Não há persistência de nicknames.

Substitua `assets/logo.png` para trocar a logo. Se o arquivo não existir, aparece o fallback `LOGO`.
