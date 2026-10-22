# Executed as encoded, public code. The Key arrives only through stdin.
$ErrorActionPreference = 'Stop'
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class AnkeMoneyVault {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Credential {
    public UInt32 Flags, Type;
    public string TargetName, Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist, AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias, UserName;
  }
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool Read(string target, UInt32 type, UInt32 flags, out IntPtr credential);
  [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool Write(ref Credential credential, UInt32 flags);
  [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool Delete(string target, UInt32 type, UInt32 flags);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr buffer);
  public static int Run(string action, string target) {
    if (action == "read") {
      IntPtr pointer;
      if (!Read(target, 1, 0, out pointer)) return Marshal.GetLastWin32Error() == 1168 ? 42 : 1;
      try {
        var c = (Credential)Marshal.PtrToStructure(pointer, typeof(Credential));
        byte[] bytes = new byte[c.CredentialBlobSize];
        Marshal.Copy(c.CredentialBlob, bytes, 0, bytes.Length);
        Console.Write(Encoding.UTF8.GetString(bytes));
        Array.Clear(bytes, 0, bytes.Length);
        return 0;
      } finally { CredFree(pointer); }
    }
    if (action == "delete") return Delete(target, 1, 0) || Marshal.GetLastWin32Error() == 1168 ? 0 : 1;
    if (action != "write") return 1;
    byte[] secret = Encoding.UTF8.GetBytes(Console.In.ReadToEnd());
    IntPtr blob = Marshal.AllocHGlobal(secret.Length);
    try {
      Marshal.Copy(secret, 0, blob, secret.Length);
      var c = new Credential { Type=1, TargetName=target, UserName="anke-money-agent",
        CredentialBlob=blob, CredentialBlobSize=(UInt32)secret.Length, Persist=2 };
      return Write(ref c, 0) ? 0 : 1;
    } finally {
      for (int i=0; i<secret.Length; i++) Marshal.WriteByte(blob, i, 0);
      Marshal.FreeHGlobal(blob);
      Array.Clear(secret, 0, secret.Length);
    }
  }
}
'@
  $result = [AnkeMoneyVault]::Run('__ACTION__', '__TARGET__')
  exit $result
} catch {
  # Do not print exceptions, stdin or credential contents.
  exit 1
}
