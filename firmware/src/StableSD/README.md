# Bundled SD 1.3.0

Source copied from locally installed Arduino SD 1.3.0. Original source
license/copyright notices are preserved (GPLv3).

Kept inside the sketch src tree so Arduino IDE/CLI compile the same library.
File.cpp includes the local header; no global SD installation is required.

Patch: File::flush retries the underlying sync up to three times and sets
Print write error on exhaustion. Rows are never replayed. SDClass exposes
read-only card errorCode/errorData for diagnostics. Recording uses buffered
FILE_WRITE; checkpoint flush occurs about every second and before save ACK.
