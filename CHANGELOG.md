# 1.4.0 — Vozes do Mac e instalação opcional no painel

- Detecção da plataforma pela API do Chrome.
- Mac usa vozes do sistema sem Edge TTS ou instalador.
- Windows usa o Edge TTS quando disponível e vozes do sistema como alternativa.
- CTA pulsante dentro do painel: Quer um áudio mais nítido? Instale o Edge TTS.
- Removida abertura automática da página de instalação.
- Servidor Edge configurado manualmente pode ser reconhecido como disponível.
- Mantidos cancelamento, variante de idioma e ausência de retentativas agendadas de legendas.

# 1.3.1 — Pasta limpa para o Chrome

- Empacotador gera chrome-extension/ sem caches Python ou arquivos de compilação.
- Validação rejeita nomes reservados antes de distribuir a extensão.
- Documentação orienta carregar a pasta limpa ou extrair o ZIP da release.
- Instalador de voz 1.0.0 preservado; nenhuma alteração na narração.

# 1.3.0 — Serviço de Voz e instalação guiada

- Instalador Windows x64 autossuficiente com Python e dependências incluídos.
- Instalação/reparo por usuário, desinstalador e rollback de atualização.
- Integração Native Messaging para iniciar a voz sob demanda.
- Configuração de primeira execução com explicação dos componentes e teste de voz.
- Pacote de extensão limpo, hashes e teste real dos executáveis.
- Mantidas identidade própria e remoção das retentativas agendadas de legendas.

# SpeakTube — identidade atualizada, 2026-11-10

- Nome SpeakTube aplicado no manifesto, painel, prévia, traduções, scripts e cópias locais.
- Autoria: Created by Rica Soares.
- Página de doações anterior substituída pela página Sobre; removida atualização automática pela listagem anterior da loja.

# 1.2.0 — revisão local, 2026-11-09

- Interface refeita com fontes do sistema, cores menta/violeta e controles acessíveis.
- Popup convertido em painel próprio fixado à esquerda, aberto pelo ícone.
- Prévia de voz e estilos Natural, Calma, Dinâmica e Grave.
- Variante de voz portuguesa explícita: Brasil ou Portugal, sem troca silenciosa no modo automático.
- Seleção automática de voz, agrupamento de legendas e volume original configuráveis.
- Correções de fila, navegação, cancelamento, carregamento e separação de legendas por aba/vídeo.
- Testes Node sem dependências e prévia local isolada.

Validação: testes de lógica e integração simulada, sintaxe e interação com a página de prévia. A reprodução na extensão instalada com vídeos reais permanece pendente.

- Vozes nativas substituídas por Edge TTS neural via serviço local, com cache, pré-carregamento e cancelamento de áudio.
