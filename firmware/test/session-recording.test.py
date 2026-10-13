"""Run real SD-session functions against host-side SD failure injection.
No board or Arduino libraries are required: python3 session-recording.test.py.
"""
from pathlib import Path
import subprocess
import tempfile

source = (Path(__file__).resolve().parents[1] / 'device.cpp').read_text()
globals_ = source[source.index('#define SD_LOG_FREQ'):source.index('\n\nSimpleFusion fuser;')]
measurement = source[source.index('void measure('):source.index('// Helper: write N samples')]
functions = source[source.index('// Helper: write N samples'):source.index('// Sample sensor.', source.index('// Helper: write N samples'))]
commands = source[source.index('    else if (readString == CALIB)'):source.index('    // Threshold margins', source.index('    else if (readString == START_RECORDING)'))]
stubs = r'''
#include <cassert>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <cstdint>
using String = std::string;
#define F(s) s
#define FILE_WRITE 1
#define O_SYNC 2
#define START_RECORDING String("START")
#define STOP String("K")
#define CALIB String("C")
#define ARM String("A")
#define BACK String("B")
#define FEEDBACK_ON String("F")
#define FEEDBACK_OFF String("N")
#define ARM_DEV 1
#define BACK_DEV 2
const float YELLOW_LIMIT_ARM=30, RED_LIMIT_ARM=60, YELLOW_LIMIT_NECK=20, RED_LIMIT_NECK=40;
struct session_metadata {char subject_name[17]="trial"; unsigned long session_start_ms=0; int threshold_margin=0; bool filter_enabled=true; float gyro_favoring=0; float threshold_yellow=0,threshold_red=0;};
struct werg_unit {void* myVib=nullptr;bool calibrated=true,session_active=false,feedback=false;int devType=ARM_DEV,threshold_margin=0;unsigned long session_begin=0;float calibRoll=12.25,calibPitch=33.5;session_metadata session_meta;};
bool available=true,failOpen=false,failNames=false,failMetadata=false,failWrite=false,failFlush=false;
unsigned long clock_ms=1000,previousMillisSDLog=0,previousMillis=0,previousMillisFilter=0;
#define IMU_FREQ 10
#define DEV_FREQ 40
int num_of_samples=0;float sum_of_angles=0,sum_of_angles_2=0;
void takeSample(werg_unit*,float* angles){angles[0]=42;angles[1]=12;}
void checkAngle(float*,werg_unit*,bool* feedback){*feedback=false;}
unsigned long millis(){return clock_ms;}
int name_count=0,metadata_count=0;char session_filename[18]="S001.CSV";
struct SerialMock{template<class T>void println(T){} template<class T>void print(T){}}Serial;
struct File {
 bool opened=false,error=false;std::vector<std::string> rows;
 operator bool()const{return opened;}
 void println(const char*){}
 size_t write(const uint8_t* row,size_t length){if(failWrite){error=true;return 0;}rows.emplace_back((const char*)row,length);return length;}
 bool getWriteError(){return error;}void setWriteError(){error=true;}
 void flush(){if(failFlush)error=true;}void close(){opened=false;}
};
struct SDMock{uint8_t errorCode(){return 0;}uint8_t errorData(){return 0;}File open(const char*,int mode){assert(mode == FILE_WRITE);File f;f.opened=!failOpen;return f;}}SD;
bool sd_is_available(){return available;}void sd_set_unavailable(){available=false;}
bool sd_write_metadata(werg_unit*){metadata_count++;if(failMetadata){available=false;return false;}return true;}
bool sd_create_session_files(const char*){if(failNames)return false;snprintf(session_filename,18,"S%03d.CSV",++name_count);return true;}
String format_elapsed_time(uint32_t elapsed){return std::to_string(elapsed);}
struct Fusion{bool isEnabled(){return true;}struct Config{float pitchFavoring=.96f;};Config getConfig(){return {};}}fuser;
int vib_updates=0,calibrations=0;void vibrator_update(){vib_updates++;}void noVib(){}
bool vibrator_test_active(){return false;}
bool vibrator_test(void*,bool){return true;}
void savePreferencesType(int){}
void calibDevice(werg_unit*d){calibrations++;d->calibRoll=0;d->calibPitch=0;}
bool isTypeSet(werg_unit*d){return d->devType==ARM_DEV||d->devType==BACK_DEV;}
std::string response;void ble_send_ack(const char*c,const char*r){response="ACK:"+String(c)+":"+r;}void ble_send_error(const char*c,const char*r){response="ERROR:"+String(c)+":"+r;}
'''
tests = r'''
void command(const String& readString,werg_unit* werg_device){if(false){}
COMMANDS
}
void reset(){available=true;failOpen=failNames=failMetadata=failWrite=failFlush=false;file_open=false;session_initialized=false;header_written=metadata_written=false;session_file=File();session_reset_buffers();session_dropped_samples=0;response="";}
int main(){
 werg_unit d;
 reset();command("K",&d);assert(response.rfind("ERROR:K:",0)==0);
 reset();clock_ms=0;assert(session_start_sd(&d));
 for(clock_ms=10;clock_ms<=1000;clock_ms+=10){float angles[2]={};bool updated=false;measure(&d,angles,&updated);}
 assert(buf_fill==10); // 100 ms schedule on a 40 ms reporting loop.
 d.session_active=false;assert(store_session(&d));
 reset();command("START",&d);assert(response.rfind("ACK:START:",0)==0);assert(d.session_active);assert(d.calibRoll==12.25&&d.calibPitch==33.5&&d.calibrated);
 buffers[0][0]={42.345f,0,100};buf_fill=1;
 assert(store_session(&d));assert(session_file.rows[0].find(",42.35,")!=std::string::npos);
 d.session_active=false;assert(session_start_sd(&d));
 int first=name_count;command("START",&d);assert(response.rfind("ERROR:START:",0)==0);assert(name_count==first);
 buf_fill=3;for(int i=0;i<3;i++)buffers[0][i]={float(i),0,uint32_t(i*100)};
 command("K",&d);assert(response.rfind("ACK:K:",0)==0);assert(!d.session_active);assert(!file_open);assert(session_file.rows.size()==3);assert(buf_fill==0);assert(d.calibrated);
 command("START",&d);assert(name_count==first+1);assert(d.calibRoll==12.25&&d.calibPitch==33.5);command("K",&d);
 // Reconfiguration must finish old rows before changing type/calibration.
 reset();d.devType=ARM_DEV;assert(session_start_sd(&d));buf_fill=2;buffers[0][0]={25,0,100};buffers[0][1]={35,0,200};
 int before_vib=vib_updates;command("B",&d);assert(d.devType==BACK_DEV);assert(!d.calibrated);assert(!d.session_active);assert(session_file.rows.size()==2);assert(session_file.rows[0].find("green")!=std::string::npos);assert(vib_updates>=before_vib+4);
 reset();d.devType=ARM_DEV;d.calibrated=true;assert(session_start_sd(&d));buf_fill=1;failWrite=true;command("B",&d);assert(response.rfind("ERROR:B:",0)==0);assert(d.devType==ARM_DEV&&d.calibrated);
 reset();d.devType=ARM_DEV;d.calibrated=true;assert(session_start_sd(&d));buf_fill=1;failWrite=true;int before_cal=calibrations;command("C",&d);assert(response.rfind("ERROR:C:",0)==0);assert(calibrations==before_cal&&d.calibrated);
 reset();assert(session_start_sd(&d));buf_fill=1;sum_of_angles=50;num_of_samples=2;command("C",&d);assert(response.rfind("ACK:C:",0)==0);assert(calibrations==before_cal+1);assert(sum_of_angles==0&&num_of_samples==0);command("K",&d);
 // Feedback can be re-enabled after stop without modifying calibration.
 command("F",&d);assert(d.feedback);command("N",&d);assert(!d.feedback);
 // Full inactive buffer plus a partial active buffer both survive stop.
 reset();assert(session_start_sd(&d));active_buf=1;drain_count=BUF_SIZE;write_pending=true;buf_fill=7;assert(store_session(&d));assert(session_file.rows.size()==BUF_SIZE+7);assert(!write_pending&&!buf_fill);
 // Partial buffers persist after one second, without waiting for capacity.
 reset();assert(session_start_sd(&d));buf_fill=8;clock_ms+=1001;assert(session_save_needed());while(session_save_needed())session_handle_save(&d);assert(session_file.rows.size()==8);assert(buf_fill==0);
 for(int scenario=0;scenario<4;scenario++){reset();d.session_active=false;if(scenario==0)available=false;if(scenario==1)failOpen=true;if(scenario==2)failNames=true;if(scenario==3)failMetadata=true;command("START",&d);assert(response.rfind("ERROR:START:",0)==0);assert(!d.session_active);assert(d.calibrated);}
 reset();d.calibrated=false;command("START",&d);assert(response.rfind("ERROR:START:",0)==0);d.calibrated=true;
 reset();assert(session_start_sd(&d));buf_fill=2;failWrite=true;command("K",&d);assert(response.rfind("ERROR:K:",0)==0);assert(!d.session_active);assert(!available);
 reset();assert(session_start_sd(&d));session_dropped_samples=1;command("K",&d);assert(response.rfind("ERROR:K:",0)==0);
 // Failed final synchronization never reports saved or releases RAM samples.
 reset();d.calibrated=true;assert(session_start_sd(&d));buffers[0][0]={42,0,100};buf_fill=1;failFlush=true;command("K",&d);assert(response.rfind("ERROR:K:",0)==0);assert(buf_fill==1);
 reset();assert(session_start_sd(&d));buffers[0][0]={42,0,100};buf_fill=1;failFlush=true;clock_ms+=1001;session_handle_save(&d);assert(!available&&write_pending);assert(response.find("Sync failed")!=std::string::npos);
 // Invalid data and real SD failures get distinct error messages.
 reset();d.calibrated=true;assert(session_start_sd(&d));buffers[0][0]={NAN,0,100};buf_fill=1;clock_ms+=1001;session_handle_save(&d);assert(response=="ERROR:SD:Invalid sensor angle");assert(!d.session_active);
 reset();assert(session_start_sd(&d));buffers[0][0]={42,0,100};buf_fill=1;failWrite=true;clock_ms+=1001;session_handle_save(&d);assert(response=="ERROR:SD:SD row write failed");assert(!d.session_active);
 // Ten minutes of production measurement/drain scheduling, not wall-clock wait.
 reset();d.calibrated=true;d.devType=ARM_DEV;clock_ms=previousMillis=previousMillisFilter=0;sum_of_angles=sum_of_angles_2=0;num_of_samples=0;
 assert(session_start_sd(&d));
 for(clock_ms=10;clock_ms<=600000;clock_ms+=10){float angles[2]={};bool updated=false;measure(&d,angles,&updated);if(session_save_needed())session_handle_save(&d);}
 command("K",&d);assert(response.rfind("ACK:K:",0)==0);assert(session_file.rows.size()==6000);assert(session_dropped_samples==0);assert(!buf_fill&&!write_pending);
 puts("PASS: ten-minute 10 Hz simulated recording yields 6000 rows with zero buffer drops; reconfiguration saves old data before mutation, failure preserves calibration/type, SD writes update vibration, format/storage errors separated; real firmware START/K, calibration preservation, repeated sessions, both buffers, periodic SD drain, missing/full/failing SD, incomplete-save rejection.");
}
'''
with tempfile.TemporaryDirectory(prefix='wergonic-session-test-') as temp:
    path = Path(temp)
    (path/'test.cpp').write_text(stubs + globals_ + '\n' + measurement + functions + tests.replace('COMMANDS', commands))
    subprocess.run(['clang++','-std=c++17',str(path/'test.cpp'),'-o',str(path/'test')],check=True)
    subprocess.run([str(path/'test')],check=True)
