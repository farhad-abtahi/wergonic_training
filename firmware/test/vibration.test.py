"""Run production vibration state machine with a mock motor and clock."""
from pathlib import Path
import subprocess
import tempfile
s=(Path(__file__).resolve().parents[1]/'vibrator.cpp').read_text()
code=s[s.index('Adafruit_DRV2605 drv;'):s.index('// Detect the Adafruit driver')]
stubs=r'''
#include <cstdint>
#include <cassert>
#include <cstdio>
#define F(x) x
#define LED_BUILTIN 1
#define LEDB 2
#define LOW 0
unsigned long now=0;unsigned long millis(){return now;}void delay(int n){now+=n;}
void ledsOff(){}void digitalWrite(int,int){}
struct Adafruit_DRV2605{int value=0;void setRealtimeValue(int n){value=n;}};
struct SerialMock{void println(const char*){}}Serial;
struct vibrator{int alert_time=300,pause_time=600;uint8_t vibIntensity=80;};
enum VibPhase{VIB_IDLE,VIB_WARNING_PULSE1,VIB_WARNING_PAUSE,VIB_WARNING_PULSE2,VIB_ALERT_ON};
'''
tests=r'''
int main(){
 vibrator motor;
 assert(!vibrator_test(&motor,true));assert(drv.value==0);
 driver_ready=true;now=0;assert(vibrator_test(&motor,true));assert(drv.value==48&&vibrator_test_active());
 now=300;vibrator_update();assert(drv.value==0);
 now=900;vibrator_update();assert(drv.value==48);
 now=1200;vibrator_update();assert(drv.value==0&&!vibrator_test_active());
 now=2000;assert(vibrator_test(&motor,false));assert(drv.value==64);
 now=3299;vibrator_update();assert(drv.value==64);
 now=3300;vibrator_update();assert(drv.value==0&&!vibrator_test_active());
 now=4000;vibrator_test(&motor,true);noVib();now=5000;vibrator_update();assert(drv.value==0&&!vibrator_test_active());
 motor.vibIntensity=40;alert(&motor);assert(drv.value==32);noVib();
 puts("PASS: actual double-pulse timing, steady test auto-stop, immediate cancellation, strength scaling and missing-driver rejection.");
}
'''
with tempfile.TemporaryDirectory() as t:
 p=Path(t);(p/'test.cpp').write_text(stubs+code+tests)
 subprocess.run(['clang++','-std=c++17',str(p/'test.cpp'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
