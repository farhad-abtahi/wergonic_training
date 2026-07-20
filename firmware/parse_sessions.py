import matplotlib.pyplot as plt

def plot_session_data(file_path):
    try:
        with open(file_path, 'r') as file:
            lines = file.readlines()
    except FileNotFoundError:
        print(f"Error: The file '{file_path}' was not found.")
        return
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    sessions = []
    current_session = []

    for line in lines:
        line = line.strip()
        if line.startswith("Session for device"):
            if current_session:
                sessions.append(current_session)
            current_session = []
            continue

        if line and ',' in line:
            try:
                parts = line.split(',')
                if len(parts) == 4:
                    seconds, mseconds = map(int, parts[:2])
                    angle = float(parts[3])
                    total_seconds = seconds
                    current_session.append((total_seconds, angle))
                else:
                    print(f"Skipping invalid line: {line} | Error: Invalid number of columns")
            except ValueError as e:
                print(f"Skipping invalid line: {line} | Error: {e}")

    if current_session:
        sessions.append(current_session)

    if not sessions:
        print("No valid session data found in the file.")
        return

    fig, axs = plt.subplots(len(sessions), 1, figsize=(10, 6 * len(sessions)))

    if len(sessions) == 1:
        axs = [axs]

    for i, session in enumerate(sessions):
        times = [x[0] for x in session]
        angles = [x[1] for x in session]

        axs[i].plot(times, angles, label=f'Session {i + 1}')
        axs[i].set_xlabel('Time (Seconds)')
        axs[i].set_ylabel('Angle')
        axs[i].set_title(f'Session {i + 1} - Angle vs Time')
        axs[i].grid(True)
        axs[i].legend()

    plt.tight_layout()
    plt.show()

if __name__ == "__main__":
    file_path = input("Enter the file path: ").strip()
    plot_session_data(file_path)

