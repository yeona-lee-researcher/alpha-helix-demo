import sys
import ast

path = "/home/ec2-user/analytics/app/main.py"
with open(path, "rb") as f:
    data = f.read()

orig_len = len(data)
data_lf = data.replace(b"\r\n", b"\n")

with open(path, "wb") as f:
    f.write(data_lf)

print(f"CRLF->LF: {orig_len} -> {len(data_lf)} bytes, removed {orig_len - len(data_lf)} bytes")

# Syntax check
try:
    ast.parse(data_lf.decode("utf-8"))
    print("SYNTAX OK")
except SyntaxError as e:
    print(f"SYNTAX ERROR: {e}")
