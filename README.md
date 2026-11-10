# SpeakTube

Created by Rica Soares

Extensão Chrome para narrar legendas do YouTube com vozes neurais do Edge TTS. Inclui painel de ajustes, seleção de idioma/voz, controle de áudio e instalador do Serviço de Voz para Windows 64 bits.

## Instalar

Neste projeto local, selecione **`E:\APPS\SpeakTube\chrome-extension`** ao carregar no Chrome. A raiz `E:\APPS\SpeakTube` é a pasta de desenvolvimento e contém arquivos Python/build que não devem ser carregados como extensão. O empacotador gera a pasta limpa automaticamente.

1. Baixe **SpeakTube-1.3.1-Chrome.zip** na [página de versões](https://github.com/ricardosoli777/SPEAKTUBE/releases).
2. Extraia o ZIP em uma pasta permanente.
3. Abra `chrome://extensions`, ative **Modo do desenvolvedor**, escolha **Carregar sem compactação** e selecione a pasta extraída que contém `manifest.json`.
4. Na página de boas-vindas, clique em **Baixar instalador para Windows**, abra o arquivo e siga o assistente.
5. Volte à configuração do SpeakTube e use **Verificar instalação**, **Iniciar serviço** e **Ouvir frase de teste**.
6. Abra um vídeo com legendas no YouTube e clique no robô do SpeakTube.

Se a extensão já estava instalada, a configuração pode ser aberta pelo link **Configurar / instalar serviço de voz** no painel. Atualize a extensão e as abas do YouTube após substituir os arquivos. O Chrome pode solicitar a nova permissão de comunicação com o serviço de voz.

O instalador também está disponível separadamente: **SpeakTubeVoiceSetup.exe** na página de versões. Ele inclui Python, Edge TTS e dependências: o usuário final não precisa instalar Python nem executar comandos. A instalação é por usuário e registra a conexão com o Google Chrome. O serviço inicia sob demanda quando a extensão solicita voz; o instalador não cria inicialização automática do Windows.

## Requisitos e funcionamento

- Google Chrome 114 ou posterior; instalador para Windows x64.
- Internet para acessar as vozes da Microsoft. O texto narrado é enviado a esse serviço; não há exigência de chave de API.
- Legendas disponibilizadas pelo próprio YouTube. O SpeakTube solicita tradução pelo idioma escolhido; não transcreve vídeos sem legendas.
- ID independente: `dlnpomclnceomfiplgjkfendkdncfdkf`.

Idioma da tradução e variante da voz são escolhas distintas. Escolher voz brasileira ou portuguesa controla a pronúncia; a tradução genérica `pt` do YouTube não garante vocabulário regional.

No modo automático, a voz fica perto de 1× e o vídeo pode desacelerar gradualmente. Trechos atrasados permanecem na fila, o que pode acumular atraso; avançar ou retroceder manualmente reposiciona a narração. A extensão não agenda novas tentativas de carregar legendas após resposta vazia ou erro HTTP. Uma reinicialização explícita ou mudança de página permite outra carga.

## Se não narrar

1. Abra **Configurar / instalar serviço de voz** e teste a frase de voz.
2. Confirme que o vídeo oferece legendas e que a narração está ativada.
3. Verifique bloqueios de cookies e restrições aplicadas ao YouTube. O bloqueio de cookies foi identificado pelo usuário como causa de uma falha de funcionamento; um HTTP 429 isolado não comprova banimento de conta/IP nem indica prazo de liberação.
4. Se o serviço não for encontrado, execute novamente o instalador para reparar a instalação e depois verifique a conexão.

Não há troca silenciosa para as vozes do navegador quando o Edge TTS falha. As mensagens distinguem falhas de voz e de carregamento de legendas.

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

## Validação da versão 1.3.x

- Testes de lógica da extensão e de descoberta/cancelamento/isolamento de legendas.
- Testes de instalação, atualização, rollback, integridade do pacote, desinstalação e protocolo nativo.
- Teste do instalador gerado: extração, executável sem Python no PATH, catálogo e síntese reais, encerramento do serviço e ciclo real de registro por usuário no Windows.

A validação local não substitui teste em todos os computadores, redes e políticas de Chrome. A reprodução depende das legendas, permissões do navegador e disponibilidade do serviço online.
