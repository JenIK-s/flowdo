@echo off
REM Сборка FlowDo.exe (запускать на Windows, нужен Python 3.10+)
python -m venv .venv || goto :err
call .venv\Scripts\activate.bat
pip install -r requirements.txt pyinstaller || goto :err
pyinstaller --noconfirm --clean --onefile --windowed --name FlowDo --icon assets\icon.ico ^
  --add-data "app\static;app\static" ^
  --collect-submodules uvicorn --collect-submodules webview ^
  run.py || goto :err
echo.
echo Готово: dist\FlowDo.exe
exit /b 0
:err
echo Сборка не удалась
exit /b 1
