# SpeakTube

Created by Rica Soares

Extensão Chrome para narrar legendas do YouTube com vozes do sistema ou vozes neurais opcionais do Edge TTS. Inclui painel de ajustes, seleção de idioma/voz, controle de áudio e instalador do Serviço de Voz para Windows 64 bits.

## Instalar

Neste projeto local, selecione **`E:\APPS\SpeakTube\chrome-extension`** ao carregar no Chrome. A raiz `E:\APPS\SpeakTube` é a pasta de desenvolvimento e contém arquivos Python/build que não devem ser carregados como extensão. O empacotador gera a pasta limpa automaticamente.

1. Baixe **SpeakTube-1.4.0-Chrome.zip** na [página de versões](https://github.com/ricardosoli777/SPEAKTUBE/releases).
2. Extraia o ZIP em uma pasta permanente.
3. Abra `chrome://extensions`, ative **Modo do desenvolvedor**, escolha **Carregar sem compactação** e selecione a pasta extraída que contém `manifest.json`.
4. Abra um vídeo com legendas no YouTube e clique no robô do SpeakTube. A instalação não abre outra aba automaticamente.
5. No Mac, a extensão usa as vozes disponíveis no sistema, sem instalar Edge TTS.
6. No Windows, as vozes do sistema podem ser usadas imediatamente. Para experimentar vozes neurais, use o botão **Quer um áudio mais nítido? Instale o Edge TTS**, dentro do painel. Baixe e execute o instalador opcional e depois reabra o SpeakTube.

No Windows, a configuração detalhada pode ser aberta manualmente pelo link **Configurar / instalar serviço de voz** no painel. No Mac, esse link e o instalador Windows não são exibidos. Atualize a extensão e as abas do YouTube após substituir os arquivos. O Chrome pode solicitar a nova permissão de comunicação com o serviço de voz.

O instalador Windows opcional também está disponível separadamente: **SpeakTubeVoiceSetup.exe** na página de versões. Ele inclui Python, Edge TTS e dependências: o usuário final não precisa instalar Python nem executar comandos. A instalação é por usuário e registra a conexão com o Google Chrome. O serviço inicia sob demanda quando a extensão solicita voz; o instalador não cria inicialização automática do Windows.

## Requisitos e funcionamento

- Google Chrome 114 ou posterior no Windows ou macOS; instalador opcional apenas para Windows x64.
- A plataforma é detectada pela API do Chrome. No macOS, o motor é `speechSynthesis`, usando as vozes que o sistema/navegador disponibilizar. No Windows, o Edge TTS é preferido quando disponível; caso contrário, o painel identifica o uso das vozes do sistema.
- Ao usar Edge TTS, é necessária internet para acessar as vozes da Microsoft; o texto narrado é enviado a esse serviço, sem chave de API. As vozes nativas seguem a disponibilidade e o funcionamento do sistema/navegador.
- Legendas disponibilizadas pelo próprio YouTube. O SpeakTube solicita tradução pelo idioma escolhido; não transcreve vídeos sem legendas.
- ID independente: `dlnpomclnceomfiplgjkfendkdncfdkf`.

Idioma da tradução e variante da voz são escolhas distintas. Escolher voz brasileira ou portuguesa controla a pronúncia; a tradução genérica `pt` do YouTube não garante vocabulário regional.

No modo automático, a voz fica perto de 1× e o vídeo pode desacelerar gradualmente. Trechos atrasados permanecem na fila, o que pode acumular atraso; avançar ou retroceder manualmente reposiciona a narração. A extensão não agenda novas tentativas de carregar legendas após resposta vazia ou erro HTTP. Uma reinicialização explícita ou mudança de página permite outra carga.

## Se não narrar

1. Abra **Configurar / instalar serviço de voz** e teste a frase de voz.
2. Confirme que o vídeo oferece legendas e que a narração está ativada.
3. Verifique bloqueios de cookies e restrições aplicadas ao YouTube. O bloqueio de cookies foi identificado pelo usuário como causa de uma falha de funcionamento; um HTTP 429 isolado não comprova banimento de conta/IP nem indica prazo de liberação.
4. Se o serviço não for encontrado, execute novamente o instalador para reparar a instalação e depois verifique a conexão.

O painel identifica se está usando vozes do sistema ou Edge TTS. O botão opcional de instalação aparece somente no Windows quando o Edge não está disponível. A animação respeita a preferência de movimento reduzido. Vozeamento pode depender de uma interação com o vídeo ou a prévia, e a variante/idioma precisa existir no catálogo de vozes do sistema.

## Remover ou reparar

O Serviço de Voz aparece em **Aplicativos instalados** do Windows como **SpeakTube - Serviço de Voz**. É possível executar novamente o instalador para reparar. Remover o serviço não remove a extensão; remover a extensão não desinstala o aplicativo local.

Instalação local: `%LOCALAPPDATA%\SpeakTube\Service`. O desinstalador remove apenas os arquivos identificados do serviço e os registros correspondentes. A pasta irmã de chaves privadas não acompanha a distribuição e não é removida.

O executável produzido nesta versão não possui assinatura Authenticode. Os hashes para conferência estão em `SHA256SUMS.txt` na mesma versão do download.

## Desenvolvimento

```powershell
node --test tests/*.test.cjs
python -m unittest discover -s tests -p test_installer.py -v
```

O segundo comando requer `edge-tts` no ambiente de desenvolvimento. A compilação isolada e o teste dos executáveis estão documentados em [installer/README.md](installer/README.md).

O repositório contém o código-fonte. O instalador compilado e o pacote completo da extensão são distribuídos em **Releases**. Quem clonar o código precisa compilar o instalador antes de usar o botão de download local da página de configuração.

Para desenvolvimento sem o aplicativo empacotado, `python -m pip install -r requirements.txt` e `Start-EdgeTTS.ps1` iniciam o servidor local em `127.0.0.1:8766`. Esse caminho é opcional e não se aplica ao usuário do instalador.

## Validação das versões 1.3.x e 1.4.0

- Testes de lógica da extensão e de descoberta/cancelamento/isolamento de legendas.
- Testes de instalação, atualização, rollback, integridade do pacote, desinstalação e protocolo nativo.
- Teste do instalador gerado: extração, executável sem Python no PATH, catálogo e síntese reais, encerramento do serviço e ciclo real de registro por usuário no Windows.

A validação local não substitui teste em todos os computadores, redes e políticas de Chrome. A reprodução depende das legendas, permissões do navegador e disponibilidade do serviço online.


### Mac sem instalador e CTA no painel — 1.4.0

A abertura automática da página de instalação foi removida. O Mac não faz requisições de catálogo/síntese ao Edge TTS e não pede o instalador Windows. As vozes são descobertas pela API nativa, incluindo vozes carregadas posteriormente. Não há promessa de que todo Mac já tenha todas as variantes/idiomas instalados.

A lógica Mac foi testada em simulação e o painel foi conferido com plataforma Mac simulada; não foi testado em um Mac físico nesta sessão. A prévia de voz nativa foi reproduzida no Chrome do Windows. O instalador de voz 1.0.0 permanece o mesmo executável já validado.

A primeira descoberta de legendas pode aguardar ate 30 segundos pelos dados do player, sem fazer leituras HTTP repetidas. Um player pausado com metadados e faixa de legenda disponiveis tambem e aceito. Essa espera local nao reintroduz novas tentativas depois de falha HTTP.
