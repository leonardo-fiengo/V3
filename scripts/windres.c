/* Preserve the original Windows argument quoting when launching Python. */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wchar.h>
#include <stdlib.h>
int main(void) {
    wchar_t *tail = GetCommandLineW();
    if (*tail == L'"') { ++tail; while (*tail && *tail != L'"') ++tail; if (*tail) ++tail; }
    else { while (*tail && *tail != L' ' && *tail != L'\t') ++tail; }
    while (*tail == L' ' || *tail == L'\t') ++tail;
    wchar_t python[MAX_PATH];
    if (!SearchPathW(NULL, L"python.exe", NULL, MAX_PATH, python, NULL)) return 1;
    size_t size = wcslen(python) + wcslen(tail) + 100;
    wchar_t *command = calloc(size, sizeof(wchar_t));
    if (!command) return 1;
    _snwprintf(command, size, L"\"%ls\" \"R:/scripts/windres.py\" %ls", python, tail);
    STARTUPINFOW startup = {0}; startup.cb = sizeof(startup);
    PROCESS_INFORMATION process = {0};
    if (!CreateProcessW(python, command, NULL, NULL, TRUE, CREATE_NO_WINDOW, NULL, NULL, &startup, &process)) { free(command); return 1; }
    free(command);
    WaitForSingleObject(process.hProcess, INFINITE);
    DWORD result = 1; GetExitCodeProcess(process.hProcess, &result);
    CloseHandle(process.hProcess); CloseHandle(process.hThread);
    return (int)result;
}
