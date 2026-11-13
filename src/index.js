export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API: verificar conexão com o banco D1
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
      return Response.json({
        erro: "Rota da API não encontrada."
      }, { status: 404 });
    }

    // Entrega a Dashboard e os arquivos públicos
    return env.ASSETS.fetch(request);
  }
};
