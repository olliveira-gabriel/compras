# Controle de Compras

Vite + React + TypeScript + Supabase.

## Configuração
1. Crie um projeto no Supabase e rode `supabase/migrations/001_sistema_compras.sql` no SQL Editor.
2. Em Authentication > Users, crie o usuário `admin@app.local` com uma senha (marque "Auto Confirm"). Depois rode:
   `insert into profiles(id,name,username,role) select id,'Administrador','admin','admin' from auth.users where email='admin@app.local';`
3. Copie `.env.example` para `.env` e preencha URL e anon key.
4. `npm install` e `npm run dev`. Login: usuário `admin`.

## Publicação
`npm run build` gera `dist/`, que pode ir para Vercel, Netlify ou Cloudflare Pages (defina as 2 variáveis VITE_*).

## Ainda não incluído
- Tela de usuários (exige Edge Function com service role para criar usuários).
- Importação XLSX/CSV de produtos e exportação XLSX.
