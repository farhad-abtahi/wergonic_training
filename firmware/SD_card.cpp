#include "SD_card.h"
#include "ble_service.h"
#include <ctype.h>
#include <string.h>

// Arduino SD 1.3.0 accepts DOS 8.3 names only. Keep the in-memory names in
// the same upper-case form returned by File::name(), so comparisons for the
// active file also work when a command uses a name obtained from D.
char session_filename[MAX_FILENAME_LEN] = "S000.CSV";
char metadata_filename[MAX_FILENAME_LEN] = "S000_M.TXT";

static bool sd_available = false;

static bool has_suffix_ignore_case(const char* name, const char* suffix)
{
    if (name == nullptr || suffix == nullptr) return false;

    size_t name_len = strlen(name);
    size_t suffix_len = strlen(suffix);
    if (suffix_len > name_len) return false;

    const char* tail = name + name_len - suffix_len;
    for (size_t i = 0; i < suffix_len; i++)
    {
        unsigned char left = static_cast<unsigned char>(tail[i]);
        unsigned char right = static_cast<unsigned char>(suffix[i]);
        if (tolower(left) != tolower(right)) return false;
    }
    return true;
}

// File::name() in Arduino SD 1.3.0 returns upper-case 8.3 directory names.
// Accept both data and text files regardless of the spelling used on the
// card, and use this one predicate everywhere directory entries are filtered.
static bool is_session_file(const char* name)
{
    return has_suffix_ignore_case(name, ".csv") ||
           has_suffix_ignore_case(name, ".txt");
}

static bool select_available_session_names(const char* subject_prefix)
{
    char csv_name[MAX_FILENAME_LEN];
    char meta_name[MAX_FILENAME_LEN];
    bool has_subject = subject_prefix != nullptr && subject_prefix[0] != '\0';

    for (int session_num = 1; session_num <= 999; session_num++)
    {
        if (has_subject)
        {
            // Two subject characters leave room for the metadata suffix:
            // AB_001_M.TXT has an 8-character basename and a 3-char extension.
            snprintf(csv_name, sizeof(csv_name), "%s_%03d.CSV",
                     subject_prefix, session_num);
            snprintf(meta_name, sizeof(meta_name), "%s_%03d_M.TXT",
                     subject_prefix, session_num);
        }
        else
        {
            snprintf(csv_name, sizeof(csv_name), "S%03d.CSV", session_num);
            snprintf(meta_name, sizeof(meta_name), "S%03d_M.TXT", session_num);
        }

        // A leftover metadata file must also reserve the number; otherwise a
        // new session could silently append metadata to an old session.
        if (!SD.exists(csv_name) && !SD.exists(meta_name))
        {
            strncpy(session_filename, csv_name, MAX_FILENAME_LEN - 1);
            session_filename[MAX_FILENAME_LEN - 1] = '\0';
            strncpy(metadata_filename, meta_name, MAX_FILENAME_LEN - 1);
            metadata_filename[MAX_FILENAME_LEN - 1] = '\0';
            return true;
        }
    }

    return false;
}

bool sd_is_available(void)
{
    return sd_available;
}

void sd_set_unavailable(void)
{
    sd_available = false;
    Serial.println(F("SD disabled - continuing without logging."));
}

bool sd_init(void)
{
    Serial.print(F("Initializing SD card..."));

    // SD spec: wait at least 1ms after VCC > 2.2V for power-up.
    // In practice, cheap cards need longer. 1 second covers all cards.
    delay(1000);

    // Configure CS pin as output (required for SPI SD init on some boards)
    pinMode(CS_PIN, OUTPUT);
    digitalWrite(CS_PIN, HIGH);

    int retries = 0;
    while (retries < 5)
    {
        if (SD.begin(CS_PIN))
        {
            break;  // Success
        }
        retries++;
        Serial.print(F("Retry "));
        Serial.print(retries);
        Serial.println(F("/5..."));
        SD.end();  // Reset SPI state before retry
        // ACMD41 init can take hundreds of ms on large cards.
        // Increasing delay per retry gives slow cards more time.
        delay(500 * retries);  // 500, 1000, 1500, 2000, 2500ms
    }
    if (retries >= 5)
    {
        Serial.println(F("SD init failed! Running without SD."));
        sd_available = false;
        return false;
    }
    Serial.println(F("SD initialization done."));
    sd_available = true;

    // Select a valid 8.3 placeholder. A fresh name is selected again when
    // calibration starts the actual recording session.
    if (!select_available_session_names(nullptr))
    {
        Serial.println(F("WARNING:No free SD session number (001-999)"));
    }

    Serial.print(F("Session file: "));
    Serial.println(session_filename);
    Serial.print(F("Metadata file: "));
    Serial.println(metadata_filename);

    return true;
}

bool sd_create_session_files(const char* base_name)
{
    if (!sd_available) return false;

    // Preserve the full subject in metadata, but use at most two safe
    // alphanumeric characters in the DOS 8.3 filenames.
    char subject_prefix[3] = "";
    if (base_name != nullptr && strlen(base_name) > 0)
    {
        size_t prefix_len = 0;
        for (size_t i = 0; base_name[i] != '\0' && prefix_len < 2; i++)
        {
            unsigned char c = static_cast<unsigned char>(base_name[i]);
            if (isalnum(c))
            {
                subject_prefix[prefix_len++] = static_cast<char>(toupper(c));
            }
        }
        subject_prefix[prefix_len] = '\0';
    }

    if (!select_available_session_names(subject_prefix))
    {
        Serial.println(F("ERROR:No free SD session number (001-999)"));
        return false;
    }

    Serial.print(F("Created session: "));
    Serial.println(session_filename);
    Serial.print(F("Session metadata: "));
    Serial.println(metadata_filename);

    return true;
}

bool sd_write_metadata(werg_unit* device)
{
    if (!sd_available) return false;

    File f = SD.open(metadata_filename, FILE_WRITE);
    if (!f)
    {
        Serial.println(F("Error opening metadata file"));
        sd_available = false;
        return false;
    }

    session_metadata* m = &device->session_meta;

    f.println(F("[Session Metadata]"));

    // Subject name
    f.print(F("subject="));
    f.println(strlen(m->subject_name) > 0 ? m->subject_name : "unknown");

    // Device info
    f.print(F("device_type="));
    f.println(device->devType == ARM_DEV ? F("ARM") : F("BACK"));

    f.print(F("device_id="));
    f.println(device->devID);

    // Start datetime (if set)
    if (device->datetime_set)
    {
        f.print(F("start_date="));
        f.print(m->year);
        f.print(F("-"));
        if (m->month < 10) f.print(F("0"));
        f.print(m->month);
        f.print(F("-"));
        if (m->day < 10) f.print(F("0"));
        f.println(m->day);

        f.print(F("start_time="));
        if (m->hour < 10) f.print(F("0"));
        f.print(m->hour);
        f.print(F(":"));
        if (m->minute < 10) f.print(F("0"));
        f.print(m->minute);
        f.print(F(":"));
        if (m->second < 10) f.print(F("0"));
        f.println(m->second);
    }
    else
    {
        f.println(F("start_date=not_set"));
        f.println(F("start_time=not_set"));
    }

    // Thresholds
    f.print(F("threshold_yellow="));
    f.println(m->threshold_yellow, 1);

    f.print(F("threshold_red="));
    f.println(m->threshold_red, 1);

    f.print(F("threshold_margin="));
    f.println(m->threshold_margin);

    // Filter settings
    f.print(F("filter_enabled="));
    f.println(m->filter_enabled ? F("true") : F("false"));

    f.print(F("gyro_favoring="));
    f.println(m->gyro_favoring, 2);

    f.close();
    Serial.println(F("Metadata saved"));
    return true;
}

String format_elapsed_time(uint32_t elapsed_ms)
{
    // Format: HH:MM:SS.mmm
    uint32_t total_seconds = elapsed_ms / 1000;
    uint32_t ms = elapsed_ms % 1000;
    uint32_t seconds = total_seconds % 60;
    uint32_t minutes = (total_seconds / 60) % 60;
    uint32_t hours = total_seconds / 3600;

    char buf[16];
    snprintf(buf, sizeof(buf), "%02lu:%02lu:%02lu.%03lu",
             (unsigned long)hours, (unsigned long)minutes,
             (unsigned long)seconds, (unsigned long)ms);
    return String(buf);
}

// Legacy function for backward compatibility
bool sd_write(float angle, bool feedback, int seconds, int mseconds,
              int session_nr, File myFile, const char* device_type,
              const char* device_number)
{
    static bool header_written = false;
    static int prev_session_nr = 0;

    if (myFile)
    {
        if (!header_written || session_nr != prev_session_nr)
        {
            // Write session header
            myFile.print(F("Session for device: "));
            myFile.print(device_number);
            myFile.print(F(" placed on "));
            myFile.print(device_type);
            myFile.print(F(". "));
            myFile.println(F("Seconds, Milliseconds, Angle, Feedback"));
            header_written = true;
            prev_session_nr = session_nr;
        }

        myFile.print(seconds);
        myFile.print(F(","));
        myFile.print(mseconds);
        myFile.print(F(","));
        myFile.print(angle);
        myFile.print(F(","));
        myFile.println(feedback);

        return true;
    }
    return false;
}

bool sd_read(File myFile)
{
    return true;
}

// List all session files on SD card
void sd_list_files()
{
    if (!sd_available)
    {
        Serial.println(F("ERROR:SD not available"));
        if (isBleConnected())
        {
            ble_send_string("ERROR:SD not available");
        }
        return;
    }

    File root = SD.open("/");
    if (!root)
    {
        Serial.println(F("ERROR:Cannot open SD root"));
        sd_available = false;
        if (isBleConnected())
        {
            ble_send_string("ERROR:Cannot open SD root");
        }
        return;
    }

    Serial.println(F("FILES:BEGIN"));
    if (isBleConnected())
    {
        ble_send_string("FILES:BEGIN");
    }

    int file_count = 0;
    char line_buffer[64];

    while (true)
    {
        vibrator_update(); // keep vibration alive while walking the directory

        File entry = root.openNextFile();
        if (!entry)
        {
            break;
        }

        if (!entry.isDirectory())
        {
            const char* name = entry.name();
            if (is_session_file(name))
            {
                snprintf(line_buffer, sizeof(line_buffer), "FILE:%s,%lu",
                         name, (unsigned long)entry.size());
                Serial.println(line_buffer);

                if (isBleConnected())
                {
                    ble_send_string(line_buffer);
                }
                file_count++;
            }
        }
        entry.close();
    }

    root.close();

    snprintf(line_buffer, sizeof(line_buffer), "FILES:END,%d", file_count);
    Serial.println(line_buffer);

    if (isBleConnected())
    {
        ble_send_string(line_buffer);
    }
}

// Get count of session files
int sd_get_file_count()
{
    if (!sd_available) return -1;

    File root = SD.open("/");
    if (!root)
    {
        return -1;
    }

    int count = 0;
    while (true)
    {
        File entry = root.openNextFile();
        if (!entry)
        {
            break;
        }

        if (!entry.isDirectory())
        {
            const char* name = entry.name();
            if (is_session_file(name))
            {
                count++;
            }
        }
        entry.close();
    }

    root.close();
    return count;
}

// Get filename by index
bool sd_get_filename_by_index(int index, char* filename, size_t max_len)
{
    if (!sd_available) return false;

    File root = SD.open("/");
    if (!root)
    {
        return false;
    }

    int current = 0;
    bool found = false;

    while (true)
    {
        File entry = root.openNextFile();
        if (!entry)
        {
            break;
        }

        if (!entry.isDirectory())
        {
            const char* name = entry.name();
            if (is_session_file(name))
            {
                if (current == index)
                {
                    strncpy(filename, name, max_len - 1);
                    filename[max_len - 1] = '\0';
                    found = true;
                    entry.close();
                    break;
                }
                current++;
            }
        }
        entry.close();
    }

    root.close();
    return found;
}

// Stream file content via callback
bool sd_stream_file(const char* filename, FileChunkCallback callback)
{
    if (!sd_available) return false;

    File file = SD.open(filename, FILE_READ);
    if (!file)
    {
        Serial.print(F("ERROR:Cannot open file "));
        Serial.println(filename);
        if (isBleConnected())
        {
            char err[64];
            snprintf(err, sizeof(err), "ERROR:Cannot open file %s", filename);
            ble_send_string(err);
        }
        return false;
    }

    const size_t CHUNK_SIZE = 120;  // Match BLE chunk size for efficiency
    char buffer[CHUNK_SIZE + 1];
    size_t total_size = file.size();
    size_t bytes_sent = 0;
    bool via_ble = isBleConnected();

    // Send header
    char header[64];
    snprintf(header, sizeof(header), "STREAM:BEGIN,%s,%lu", filename, (unsigned long)total_size);
    Serial.println(header);

    if (via_ble)
    {
        ble_send_string(header);
        delay(10);
    }

    while (file.available())
    {
        // Keep vibration pattern timing alive during long transfers
        vibrator_update();

        size_t bytes_read = file.readBytes(buffer, CHUNK_SIZE);
        buffer[bytes_read] = '\0';
        bytes_sent += bytes_read;

        bool is_last = (bytes_sent >= total_size) || !file.available();

        if (callback)
        {
            callback(buffer, bytes_read, is_last);
        }
        else if (via_ble)
        {
            // Skip Serial during BLE transfer for speed
            ble_send_file_chunk(buffer, bytes_read, is_last);
        }
        else
        {
            // Serial-only transfer
            Serial.print(buffer);
        }
    }

    file.close();
    Serial.println();
    Serial.println(F("STREAM:END"));

    if (isBleConnected())
    {
        ble_send_string("STREAM:END");
    }

    return true;
}

// Read entire file into buffer (for small files like metadata)
int sd_read_file_to_buffer(const char* filename, char* buffer, size_t max_len)
{
    if (!sd_available) return -1;

    File file = SD.open(filename, FILE_READ);
    if (!file)
    {
        return -1;
    }

    size_t file_size = file.size();
    size_t bytes_to_read = (file_size < max_len - 1) ? file_size : max_len - 1;

    size_t bytes_read = file.readBytes(buffer, bytes_to_read);
    buffer[bytes_read] = '\0';

    file.close();
    return bytes_read;
}

// Check if file exists
bool sd_file_exists(const char* filename)
{
    if (!sd_available) return false;
    return SD.exists(filename);
}

// Delete a file from the SD card
bool sd_delete_file(const char* filename)
{
    if (!sd_available) return false;
    return SD.remove(filename);
}
