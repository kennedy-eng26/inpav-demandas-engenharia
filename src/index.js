
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Área reservada para futuras APIs do CRM
    if (url.pathname.startsWith("/api/")) {
      return Response.json({
        sistema: "Engenharia Inpav",
        status: "online",
        mensagem: "API preparada para desenvolvimento."
      });
    }

    // Entrega os arquivos HTML, CSS e JavaScript
    return env.ASSETS.fetch(request);
  }
};
