#ifndef SD_CARD_H_
#define SD_CARD_H_

#include "SD.h"
#include "device.h"

#define CS_PIN 4
#define MAX_FILENAME_LEN 18  // Max 18 chars (including extension) to fit in 20-byte BLE limit with R:/M: prefix

extern char session_filename[MAX_FILENAME_LEN];
extern char metadata_filename[MAX_FILENAME_LEN];

// Initialize SD card
bool sd_init(void);

// Check if SD card is available and healthy
bool sd_is_available(void);

// Mark SD as unavailable (called on failure)
void sd_set_unavailable(void);

// Create session files with given base name (or auto-generate)
// Creates both data CSV and metadata file
bool sd_create_session_files(const char* base_name);

// Write session metadata to separate file
bool sd_write_metadata(werg_unit* device);

// Format elapsed milliseconds as HH:MM:SS.mmm string
String format_elapsed_time(uint32_t elapsed_ms);

// File listing and transfer functions
// List all session files on SD card (prints to Serial and optionally to BLE)
void sd_list_files(void);

// Get count of session files
int sd_get_file_count(void);

// Get filename by index (for iteration)
bool sd_get_filename_by_index(int index, char* filename, size_t max_len);

// Read file content and stream via callback
// callback is called for each chunk: callback(chunk_data, chunk_len, is_last_chunk)
typedef void (*FileChunkCallback)(const char* data, size_t len, bool is_last);
bool sd_stream_file(const char* filename, FileChunkCallback callback);

// Read entire small file into buffer (for metadata files)
// Returns actual bytes read, or -1 on error
int sd_read_file_to_buffer(const char* filename, char* buffer, size_t max_len);

// Check if file exists
bool sd_file_exists(const char* filename);

// Delete a file from the SD card. Returns false if SD is unavailable or
// the underlying remove() fails; caller is responsible for guarding
// against deleting the active session's files.
bool sd_delete_file(const char* filename);

// Legacy functions (kept for compatibility)
bool sd_read(void);
bool sd_write(float angle, bool feedback, int seconds, int mseconds,
              int session_nr, File myFile, const char* device_type,
              const char* device_number);

#endif // SD_CARD_H_
