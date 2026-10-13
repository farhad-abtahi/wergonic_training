"""Test the actual bundled File::flush retry function with injected sync failures."""
from pathlib import Path
import subprocess
import tempfile
source = (Path(__file__).resolve().parents[1]/'src/StableSD/File.cpp').read_text()
function = source[source.index('void File::flush()'):source.index('bool File::seek(')]
write_function = source[source.index('size_t File::write(const uint8_t'):source.index('int File::availableForWrite()')]
stubs = r'''
#include <cassert>
#include <cstdint>
#include <cstdio>
int waits=0;void delay(int){waits++;}
struct Backend{int failures=0,calls=0,writes=0;bool shortWrite=false;
 bool sync(){calls++;return calls>failures;}
 void clearWriteError(){}bool getWriteError(){return false;}
 size_t write(const uint8_t*,size_t length){writes++;return shortWrite?length-1:length;}};
struct File{Backend* _file=nullptr;bool error=false;void flush();size_t write(const uint8_t*,size_t);void setWriteError(){error=true;}};
'''
tests = r'''
int main(){
 File f;f.flush();assert(!f.error);
 Backend healthy;f._file=&healthy;f.flush();assert(healthy.calls==1&&!f.error);
 Backend transient;transient.failures=2;f._file=&transient;f.flush();assert(transient.calls==3&&!f.error);
 Backend broken;broken.failures=10;f._file=&broken;f.flush();assert(broken.calls==3&&f.error);
 assert(healthy.writes==0&&transient.writes==0&&broken.writes==0);
 File writer;Backend storage;writer._file=&storage;uint8_t bytes[2]={1,2};
 assert(writer.write(bytes,2)==2&&!writer.error);storage.shortWrite=true;
 assert(writer.write(bytes,2)==0&&writer.error);
 puts("PASS: actual short writes propagate errors; actual checked SD flush succeeds, retries transient sync without replay, and reports persistent failure after three bounded attempts.");
}
'''
with tempfile.TemporaryDirectory() as temp:
 p=Path(temp);(p/'test.cpp').write_text(stubs+function+write_function+tests)
 subprocess.run(['clang++','-std=c++17',str(p/'test.cpp'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
