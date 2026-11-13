// =====================================================
// ENGENHARIA INPAV | GESTÃO DE PROJETOS
// Worker + integração D1 + inicialização do administrador
// =====================================================

const ITERATIONS = 310000;

function toBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    key,
    256
  );

  return `pbkdf2_sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

async function verifySecret(received, expected) {
  const encoder = new TextEncoder();

  const receivedHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(received))
  );

  const expectedHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(expected))
  );

  let difference = 0;

  for (let i = 0; i < receivedHash.length; i++) {
    difference |= receivedHash[i] ^ expectedHash[i];
  }

  return difference === 0;
}

function setupPage() {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Configuração inicial | Engenharia INPAV</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 30px 16px;
      font-family: Arial, sans-serif;
      background: #F2F2F2;
      color: #333;
    }
    .container {
      max-width: 480px;
      margin: 40px auto;
      padding: 30px;
      background: #FFFFFF;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,.08);
    }
    h1 { color: #3C5394; font-size: 23px; }
    p { line-height: 1.5; color: #555; }
    label {
      display: block;
      margin-top: 17px;
      font-weight: bold;
      font-size: 14px;
    }
    input {
      width: 100%;
      padding: 12px;
      margin-top: 7px;
      border: 1px solid #ccc;
      border-radius: 6px;
      font-size: 15px;
    }
    button {
      width: 100%;
      margin-top: 24px;
      padding: 14px;
      border: 0;
      border-radius: 6px;
      background: #3C5394;
      color: white;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    }
    button:disabled { opacity: .6; cursor: wait; }
    #message { margin-top: 18px; font-weight: bold; }
    .note { font-size: 13px; color: #777; }
  </style>
</head>
<body>
  <main class="container">
    <h1>Engenharia INPAV</h1>
    <p>Configuração do primeiro administrador da plataforma.</p>

    <form id="setupForm">
      <label>Nome completo</label>
      <input name="full_name" required maxlength="120"
        autocomplete="name">

      <label>E-mail de acesso</label>
      <input name="email" type="email" required maxlength="254"
        autocomplete="email">

      <label>Senha</label>
      <input name="password" type="password" required
        minlength="14" maxlength="128" autocomplete="new-password">

      <label>Chave de inicialização</label>
      <input name="secret" type="password" required
        autocomplete="off">

      <p class="note">
        A senha deve ter pelo menos 14 caracteres.
        A chave é aquela cadastrada na Cloudflare.
      </p>

      <button id="submitButton" type="submit">
        Criar primeiro administrador
      </button>
    </form>

    <div id="message" role="status"></div>
  </main>

  <script>
    const form = document.getElementById("setupForm");
    const button = document.getElementById("submitButton");
    const message = document.getElementById("message");

    form.addEventListener("submit", async function(event) {
      event.preventDefault();

      const data = Object.fromEntries(new FormData(form).entries());

      button.disabled = true;
      message.textContent = "Processando cadastro...";

      try {
        const response = await fetch("/api/bootstrap", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + data.secret
          },
          body: JSON.stringify({
            full_name: data.full_name,
            email: data.email,
            password: data.password
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.erro || "Não foi possível concluir o cadastro.");
        }

        message.textContent =
          "Administrador criado com sucesso! Você já pode fechar esta página.";

        form.reset();

      } catch (error) {
        message.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Página de configuração inicial
    if (url.pathname === "/setup-admin" && request.method === "GET") {
      return setupPage();
    }

        // Diagnóstico temporário do Bootstrap
    if (
      url.pathname === "/api/diagnostico-bootstrap" &&
      request.method === "GET"
    ) {
      return Response.json({
        worker: "online",
        bootstrap_secret_configurado: Boolean(env.BOOTSTRAP_SECRET),
        banco_d1_configurado: Boolean(env.DB),
        assets_configurado: Boolean(env.ASSETS)
      });
    }
    // Cadastro protegido do primeiro administrador
    if (url.pathname === "/api/bootstrap" && request.method === "POST") {
      try {
        if (!env.BOOTSTRAP_SECRET) {
          return Response.json(
            { erro: "Configuração de inicialização indisponível." },
            { status: 503 }
          );
        }

        const authorization = request.headers.get("Authorization") || "";
        const receivedSecret = authorization.startsWith("Bearer ")
          ? authorization.slice(7)
          : "";

        const authorized = await verifySecret(
          receivedSecret,
          env.BOOTSTRAP_SECRET
        );

        if (!authorized) {
          return Response.json(
            { erro: "Chave de inicialização inválida." },
            { status: 401 }
          );
        }

        const existingAdmin = await env.DB.prepare(
          "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
        ).first();

        if (existingAdmin) {
          return Response.json(
            { erro: "A inicialização já foi realizada. Já existe um administrador." },
            { status: 409 }
          );
        }

        const body = await request.json();

        const fullName = String(body.full_name || "").trim();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (
          fullName.length < 3 ||
          fullName.length > 120 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          email.length > 254 ||
          password.length < 14 ||
          password.length > 128
        ) {
          return Response.json(
            { erro: "Confira o nome, o e-mail e a senha. A senha deve ter pelo menos 14 caracteres." },
            { status: 400 }
          );
        }

        const existingUser = await env.DB.prepare(
          "SELECT id FROM users WHERE email = ? LIMIT 1"
        ).bind(email).first();

        if (existingUser) {
          return Response.json(
            { erro: "Este e-mail já está cadastrado." },
            { status: 409 }
          );
        }

        const passwordHash = await hashPassword(password);
        const userId = crypto.randomUUID();

        // A condição NOT EXISTS impede uma segunda inicialização,
        // inclusive se duas requisições chegarem simultaneamente.
        const result = await env.DB.prepare(`
          INSERT INTO users (
            id,
            full_name,
            email,
            password_hash,
            job_title,
            role,
            can_create_work,
            is_active
          )
          SELECT ?, ?, ?, ?, 'Administrador', 'admin', 1, 1
          WHERE NOT EXISTS (
            SELECT 1 FROM users WHERE role = 'admin'
          )
        `).bind(
          userId,
          fullName,
          email,
          passwordHash
        ).run();

        if (!result.meta || result.meta.changes !== 1) {
          return Response.json(
            { erro: "A inicialização já foi realizada ou não pôde ser concluída." },
            { status: 409 }
          );
        }

        return Response.json({
          sucesso: true,
          mensagem: "Primeiro administrador criado com sucesso.",
          usuario: {
            id: userId,
            nome: fullName,
            email,
            perfil: "admin"
          }
        }, { status: 201 });

            } catch (error) {
        console.error("ERRO NO BOOTSTRAP:", error);

        return Response.json(
          {
            erro: "Falha durante a inicialização.",
            codigo: error?.code || "ERRO_INTERNO",
            mensagem: error?.message || "Erro não identificado."
          },
          { status: 500 }
        );
      }
    }

    // Verificação da conexão com o banco D1
    if (url.pathname === "/api/health" && request.method === "GET") {
      try {
        const result = await env.DB.prepare(`
          SELECT COUNT(*) AS total
          FROM sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
            AND name NOT LIKE '_cf_%'
        `).first();

        return Response.json({
          sistema: "Engenharia INPAV | Gestão de Projetos",
          status: "online",
          banco_de_dados: "conectado",
          tabelas: result.total
        });

      } catch (error) {
        return Response.json({
          sistema: "Engenharia INPAV | Gestão de Projetos",
          status: "erro",
          banco_de_dados: "indisponível",
          mensagem: "Não foi possível consultar o banco de dados."
        }, { status: 503 });
      }
    }

    // Demais rotas da API
    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { erro: "Rota da API não encontrada." },
        { status: 404 }
      );
    }

    // Entrega a Dashboard e os arquivos públicos
    return env.ASSETS.fetch(request);
  }
};
