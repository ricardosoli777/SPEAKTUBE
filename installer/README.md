# Serviço de Voz — instalador Windows

O pacote inclui Python, Edge TTS e dependências. Instalação e integração Native Messaging são feitas por usuário, sem Python/pip no computador de destino e sem privilégios de administrador.

## Compilar (Windows x64)

```powershell
python -m venv .build-installer/venv
.\.build-installer\venv\Scripts\python.exe -m pip install "pyinstaller>=6.16,<7" "edge-tts==7.3.1"
.\.build-installer\venv\Scripts\python.exe -m unittest discover -s tests -p test_installer.py -v
node --test tests/*.test.cjs
.\.build-installer\venv\Scripts\python.exe installer/build_installer.py
.\.build-installer\venv\Scripts\python.exe installer/smoke_test.py
```

Saídas em `artifacts/release`: instalador `.exe`, extensão limpa `.zip`, hashes SHA256, informações de compilação e dependências fixadas da compilação. O `.exe` também é copiado para `installer/SpeakTubeVoiceSetup.exe`, usado pelo botão da página de boas-vindas. Não envie o ambiente de compilação, backups ou material privado ao GitHub.

## Componentes

- `voice_service.py`: host Native Messaging, início sob demanda e servidor de voz em loopback.
- `install_core.py`: instalação/atualização com rollback, registro por usuário, validação do pacote e desinstalação.
- `setup_app.py`: assistente visual com explicação dos componentes, consentimento, reparo/remoção e prévia de voz.
- `build_installer.py`: empacota runtime e dependências, instalador único e extensão por allowlist.
- `smoke_test.py`: extrai o instalador real e executa o serviço compilado com PATH sem Python; testa catálogo/síntese reais e encerramento. `--install-here` testa o ciclo real de registro/instalação se ainda não existir instalação; termina deixando o serviço instalado.

Instalação: `%LOCALAPPDATA%\SpeakTube\Service`. Chaves do usuário ficam em pasta irmã e nunca são incluídas no pacote nem removidas pelo desinstalador. Registro: `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.speaktube.voice` e entrada de desinstalação do Windows. A origem permitida é exclusivamente o ID público do SpeakTube.

A integração suporta Google Chrome no Windows x64. Internet é necessária para síntese; texto narrado é enviado à Microsoft. Não se instala na inicialização do Windows: o Chrome inicia o host registrado quando solicitado. Um servidor de desenvolvimento compatível já rodando em 8766 continua podendo ser usado.

O pacote produzido localmente não recebe assinatura Authenticode automaticamente. Há hashes SHA256 para conferência. Licenças das dependências e do Python acompanham o payload em `licenses/`.
