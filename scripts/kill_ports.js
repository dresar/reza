import { execSync } from 'child_process';

const PORTS = [1883, 5001, 8080, 8081, 3001];

console.log('[AUTO-KILL] Memeriksa dan membersihkan port:', PORTS.join(', '));

// Matikan proses berdasarkan port menggunakan PowerShell di Windows
try {
  const psCmd = `
    $ports = @(${PORTS.join(',')});
    foreach ($p in $ports) {
      try {
        $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue;
        if ($conns) {
          $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique;
          foreach ($id in $pids) {
            if ($id -gt 0) {
              Stop-Process -Id $id -Force -ErrorAction SilentlyContinue;
              Write-Host "[KILLED] Berhasil mematikan PID $id pada port $p";
            }
          }
        }
      } catch {}
    }
  `;
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCmd.replace(/\r?\n/g, ' ')}"`, { stdio: 'inherit' });
} catch (e) {
  // Abaikan jika tidak ada port yang aktif
}

console.log('[OK] Semua port siap dan bersih!');
process.exit(0);
