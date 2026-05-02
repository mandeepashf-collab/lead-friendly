"START" | Out-File C:\Users\mande\Desktop\lead-friendly\scripts\tsc-output.txt
"node-exists=$(Test-Path 'C:\Program Files\nodejs\node.exe')" | Out-File -Append C:\Users\mande\Desktop\lead-friendly\scripts\tsc-output.txt
"tsc-exists=$(Test-Path 'C:\Users\mande\Desktop\lead-friendly\node_modules\typescript\bin\tsc')" | Out-File -Append C:\Users\mande\Desktop\lead-friendly\scripts\tsc-output.txt
$ver = & "C:\Program Files\nodejs\node.exe" --version 2>&1
"node-version=$ver" | Out-File -Append C:\Users\mande\Desktop\lead-friendly\scripts\tsc-output.txt
"after-version-LASTEXITCODE=$LASTEXITCODE" | Out-File -Append C:\Users\mande\Desktop\lead-friendly\scripts\tsc-output.txt
Set-Location C:\Users\mande\Desktop\lead-friendly
$tscOut = & "C:\Program Files\nodejs\node.exe" "node_modules\typescript\bin\tsc" --noEmit 2>&1
"after-tsc-LASTEXITCODE=$LASTEXITCODE" | Out-File -Append C:\Users\mande\Desktop\lead-friendly\scripts\tsc-output.txt
"---TSC OUTPUT---" | Out-File -Append C:\Users\mande\Desktop\lead-friendly\scripts\tsc-output.txt
$tscOut | Out-File -Append C:\Users\mande\Desktop\lead-friendly\scripts\tsc-output.txt
"---END---" | Out-File -Append C:\Users\mande\Desktop\lead-friendly\scripts\tsc-output.txt
