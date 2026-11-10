"""Self-contained Windows setup wizard for the SpeakTube voice companion."""
import argparse
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import tkinter as tk
from tkinter import ttk, messagebox
import webbrowser

from install_core import (VERSION, EXTENSION_ID, HOST_NAME, default_base,
                          install, uninstall, extract_payload)


def bundled(name):
    return Path(getattr(sys, '_MEIPASS', Path(__file__).parent)) / name


def self_executable():
    return Path(sys.executable) if getattr(sys, 'frozen', False) else Path(__file__)


def test_voice(target):
    """Use the installed native executable, not system Python."""
    import struct
    command = {'command': 'start'}
    payload = json.dumps(command).encode()
    result = subprocess.run([str(target / 'SpeakTubeVoice.exe'), f'chrome-extension://{EXTENSION_ID}/'],
                            input=struct.pack('<I', len(payload)) + payload,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    if result.returncode or len(result.stdout) < 4:
        raise RuntimeError('Nao foi possivel iniciar o servico instalado.')
    size = struct.unpack('<I', result.stdout[:4])[0]
    status = json.loads(result.stdout[4:4 + size])
    if not status.get('running'):
        raise RuntimeError(status.get('error', 'O servico nao respondeu.'))
    import urllib.request
    port = os.environ.get('SPEAKTUBE_VOICE_PORT', '8766')
    request = urllib.request.Request(f'http://127.0.0.1:{port}/synthesize',
        data=json.dumps({'text': 'O SpeakTube esta pronto para narrar seus videos.',
                         'voice': 'pt-BR-FranciscaNeural', 'pitch': 0}).encode(),
        headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=45) as response:
        import base64
        data = json.load(response)
        audio = base64.b64decode(data['audio'], validate=True)
    if len(audio) < 100:
        raise RuntimeError('A sintese nao retornou audio valido.')
    folder = Path(tempfile.mkdtemp(prefix='speaktube-voice-test-'))
    path = folder / 'previa.mp3'
    path.write_bytes(audio)
    if os.name == 'nt':
        os.startfile(path)
    return path


class Wizard:
    def __init__(self, remove=False):
        self.remove = remove
        self.messages = queue.Queue()
        self.root = tk.Tk()
        self.root.title('SpeakTube - Servico de Voz')
        self.root.geometry('660x680')
        self.root.minsize(620, 640)
        self.root.configure(bg='#101319')
        self.root.protocol('WM_DELETE_WINDOW', self.close)
        self.busy = False
        style = ttk.Style(self.root)
        style.theme_use('clam')
        style.configure('TProgressbar', background='#7ce6c4', troughcolor='#303846')
        body = tk.Frame(self.root, bg='#101319', padx=32, pady=26)
        body.pack(fill='both', expand=True)
        tk.Label(body, text='SpeakTube', bg='#101319', fg='#7ce6c4',
                 font=('Segoe UI', 27, 'bold'), anchor='w').pack(fill='x')
        tk.Label(body, text='Servico de Voz  |  ' + VERSION, bg='#101319', fg='#c3b6ff',
                 font=('Segoe UI', 13), anchor='w').pack(fill='x', pady=(0, 22))
        text = ('Remover o Servico de Voz deste usuario. A extensao e os dados de outros aplicativos serao preservados.'
                if remove else
                'Uma unica instalacao para ouvir seus videos com vozes naturais.\n\n'
                'Motor de voz Edge TTS\nConverte o texto das legendas em audio usando o servico online da Microsoft. '
                'O texto narrado e enviado a Microsoft; uma conexao com a internet e necessaria.\n\n'
                'Conexao com o Chrome\nPermite que o SpeakTube inicie o servico quando precisar narrar. '
                'Somente a extensao SpeakTube autorizada pode usar essa conexao.\n\n'
                'Componentes incluidos\nPython e bibliotecas ja acompanham este pacote. Voce nao precisa instalar ferramentas nem usar comandos.')
        tk.Label(body, text=text, bg='#101319', fg='#f1f4f8', wraplength=580,
                 justify='left', font=('Segoe UI', 11), anchor='nw').pack(fill='x')
        self.accepted = tk.BooleanVar(value=remove)
        if not remove:
            tk.Checkbutton(body, text='Entendi o funcionamento e desejo instalar o servico.',
                           variable=self.accepted, bg='#101319', fg='#f1f4f8',
                           activebackground='#101319', activeforeground='#f1f4f8', selectcolor='#191e27',
                           command=self.update_button, font=('Segoe UI', 10)).pack(anchor='w', pady=(16, 10))
        self.status = tk.StringVar(value='Pronto para remover.' if remove else 'Instalacao por usuario, sem alterar o Python do computador.')
        tk.Label(body, textvariable=self.status, bg='#101319', fg='#a6b1c2', wraplength=580,
                 justify='left', font=('Segoe UI', 10)).pack(fill='x', pady=10)
        self.bar = ttk.Progressbar(body, mode='indeterminate')
        self.bar.pack(fill='x', pady=8)
        buttons = tk.Frame(body, bg='#101319')
        buttons.pack(fill='x', pady=12)
        self.primary = tk.Button(buttons, text='Remover servico' if remove else 'Instalar / reparar',
            bg='#7ce6c4', fg='#102d25', relief='flat', padx=18, pady=9,
            font=('Segoe UI', 11, 'bold'), command=self.execute)
        self.primary.pack(side='left')
        self.voice_button = tk.Button(buttons, text='Testar e ouvir voz', command=self.preview,
                                     padx=14, pady=9, state='disabled')
        if not remove:
            self.voice_button.pack(side='left', padx=10)
        tk.Button(buttons, text='Fechar', command=self.close, padx=12, pady=9).pack(side='right')
        self.update_button()
        self.root.after(100, self.poll)

    def update_button(self):
        self.primary.configure(state='normal' if self.accepted.get() and not self.busy else 'disabled')

    def progress(self, text):
        self.messages.put(('status', text))

    def execute(self):
        self.busy = True
        self.update_button()
        self.voice_button.configure(state='disabled')
        self.bar.start(12)
        def worker():
            try:
                if self.remove:
                    uninstall(progress=self.progress)
                    self.messages.put(('removed', 'Servico removido.'))
                else:
                    target = install(bundled('voice-payload.zip'), self_executable(), progress=self.progress)
                    self.messages.put(('installed', str(target)))
            except Exception as error:
                self.messages.put(('error', str(error)))
        threading.Thread(target=worker, daemon=True).start()

    def preview(self):
        self.busy = True
        self.update_button()
        self.voice_button.configure(state='disabled')
        self.bar.start(12)
        self.status.set('Iniciando o servico e gerando uma frase de teste...')
        def worker():
            try:
                test_voice(default_base() / 'Service')
                self.messages.put(('tested', 'Audio gerado e aberto no reprodutor. Volte ao SpeakTube no Chrome.'))
            except Exception as error:
                self.messages.put(('error', 'Instalacao preservada. Nao foi possivel testar a voz: ' + str(error)))
        threading.Thread(target=worker, daemon=True).start()

    def poll(self):
        try:
            while True:
                kind, value = self.messages.get_nowait()
                self.status.set(value)
                if kind != 'status':
                    self.busy = False
                    self.bar.stop()
                    self.update_button()
                    if kind in ('installed', 'tested'):
                        self.voice_button.configure(state='normal')
                    if kind == 'installed':
                        self.status.set('Instalacao concluida. Clique em Testar e ouvir voz ou volte a configuracao do SpeakTube no Chrome.')
                    if kind == 'removed':
                        self.primary.configure(state='disabled')
                    if kind == 'error':
                        messagebox.showerror('SpeakTube', value, parent=self.root)
        except queue.Empty:
            pass
        self.root.after(100, self.poll)

    def close(self):
        if self.busy:
            messagebox.showinfo('SpeakTube', 'Aguarde a operacao terminar.', parent=self.root)
            return
        self.root.destroy()

    def run(self):
        self.root.mainloop()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--uninstall', action='store_true')
    parser.add_argument('--cleanup', action='store_true')
    parser.add_argument('--extract-to')
    args = parser.parse_args()
    if args.extract_to:
        extract_payload(bundled('voice-payload.zip'), Path(args.extract_to))
        return 0
    if os.name != 'nt':
        raise RuntimeError('Este instalador e destinado ao Windows 64 bits.')
    # An executable cannot delete itself while running on Windows.
    if args.uninstall and not args.cleanup:
        folder = Path(tempfile.mkdtemp(prefix='speaktube-uninstall-'))
        launcher = folder / 'SpeakTube-Uninstall.exe'
        shutil.copy2(self_executable(), launcher)
        subprocess.Popen([str(launcher), '--uninstall', '--cleanup'], creationflags=subprocess.CREATE_NO_WINDOW)
        return 0
    Wizard(remove=args.uninstall).run()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
