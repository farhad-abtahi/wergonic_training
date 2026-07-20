I made some changes to the way the code was working in order to correct certain features. I will provide an English comment explaining what I did. I believe I have documented everything I modified.
The translation was done using ChatGPT, since I originally wrote the comments in Spanish. I will provide both versions (English and original Spanish) so you can reference the original comments as well.

English version
First, the commands were not being recognized in the console—only hexadecimal characters were interpreted. So, we changed the way the console interprets commands by converting them into a STRING, and in the command section, we updated the values to STRING types by putting them in quotes (").

########### File main.cpp
  Modified: void readConsole
File device.cpp
  Modified: void parseCommand
File SD_Card.cpp
  Modified: bool sd_write (Added a serial print "Write Successfully" before the whole process)
###########

Now, without connecting via Bluetooth, everything still works the same. The only difference is that if I run the session using CALIB and then issue a STOP (which forces saving the session to the SD card before the buffer limit is reached), it does save correctly.

########### We can see "Write Successfully" in Serial Monitor Output when executing the STOP command
###########

We modified the buffer size, reducing it, believing that the cause might be attempting to save too many files at once. But this ended up making the console crash earlier, which gave me a clue that the error might occur when trying to save the file automatically.

########### File device.cpp
  Modified: #define SESSION_SIZE 100 → 10 (Tried, but crash still appears so set default again)
  Modified: bool store_session
###########

After making a small adjustment in the buffer section, I added a check that prints an error message ("Buffer full") when the buffer is full. Upon testing, I saw the error was being thrown, so I searched for where the buffer gets refreshed or saved. To my surprise, the data is only saved when issuing STOP or via a Bluetooth call (which I haven't tested). Of course, the buffer wasn’t being refreshed, which caused the board to crash. So, I modified the code to check if the buffer is full; if it is, it prints "Buffer full", proceeds to save it to the SD card, and resets the buffer.

########### File device.cpp
  Modified: void measure (At the end, in the buffer control section, I added a check: if the buffer is full, save and restart it)
###########

Another “issue” happening now is that every time the buffer gets full, a new file is created, but it loses the timestamp, which makes it impossible to identify the files. So I made it use a single file named session.txt, and each time it saves, it prints "Next Line".

########### File device.cpp
  Modified: void store_session (Changed the file save name to a single file and added final print "Next Line")
###########

Alright, now the problem is that it would always save everything to the same file. So we made it so that when initializing the SD card, it checks if a file with that name already exists. If so, it renames it with _1, _2, or whatever index is available, so all sessions remain separated, but the lines stay grouped together.

########### File SD_card.cpp
  Modified: sd_init
File device.cpp
  Modified: store_session
###########

Now everything is working properly. The only remaining issue is that when we enter the yellow zone, the console slows down significantly. Upon checking the code in vibrator.cpp, I saw this is caused by the use of delay() to operate the vibrator, which completely blocks the board until vibration ends.

########### File vibrator.cpp
  Commented: I don't know how to properly implement void warning




Spanish Version:
I know this may not be helpful, but if there is something you don't understand in English, you can translate it again, mainly because it is explained in more detail in Spanish.

Primero que he hecho, los comandos no se reconocian en la consola, solo se reconocian carácteres hexadecimales, por lo que, hemos cambiado
la manera en la que la consola interpreta los comandos mandados a un STRING y en el apartado de los comandos, hemos cambiado los valores a STRINGS poniendolos
entre comillas (""). 

###########
File main.cpp
	Modified: void readConsole
File device.cpp
	Modified: void parseCommand
File SD_Card.cpp
	Modified: bool sd_write (Added a serial print "Write Sucessfully") before whole process
##########

Ahora, sin conectarnos a través de bluetooh, todo sigue funcionando igual, la única diferencia es que si ejecuto la sesion con CALIB y hago STOP (lo que fuerza a guardar
la sesion en la tarjeta SD antes de llegar al tamaño del buffer) este si lo guarda.

###########
We can see Write Sucessfully in serial Monitor Output when execute STOP command
##########

Hemos modificado el tamaño del buffer, disminuyendolo, creyendo que la posible causa era que intentaba guardar muchos archivos a la vez, pero esto ha terminado
en que la consola termine por crashear antes, lo que me ha dado una posible pista en que el error puede estar cuando el archivo se quiere guardar de manera automática.

###########
File device.cpp
	Modified: #define SESSION_SIZE 100 -> 10 (Tried, but crash still appears so set default again)
	Modified: bool store_session
##########

Tras hacer un pequeño ajuste en el apartado del Buffer, había añadido un comprobador que en caso de estar el buffer lleno, imprimiese un error diciendo "buffer lleno",
al probarlo, he visto que arrojaba el error y por tanto, he buscado en que momento se refrescaba o se guardaba el buffer, para mi sorpresa, únicamente se guardan los datos
a través de ejecutar STOP o a través de una llamada a través de Bluetooth, que no he comprobado, pero claro, aún así, no se refrescaba el buffer, haciendo que la placa
crashease, por lo tanto, he modificado el código para que compruebe si el buffer está lleno, si esto es así, imprime "Buffer lleno", procede a guardarlo en la SD y a reiniciarlo

###########
File device.cpp
	Modified: void measure (In the final apart, the buffer control, I added check if buffer is full, then, save and restart)
##########

Otro "error", que sucede ahora, es que cuando se llena el buffer, se crea un archivo cada vez, pero este pierde la marca de tiempo, lo que ocasiona que no se puedan reconocer
los archivos, por lo que he hecho que trabaje con un unico archivo llamado session.txt, y cada vez que guarde, imprima "Siguiente Linea".

###########
File device.cpp
	Modified: void store_session (Changed the file save name, to just one file and final print Next Line)
##########

Vale, ahora el problema es que guardaría todo dentro del mismo archivo siempre, por lo que hemos hecho que al iniciar la sd, compruebe si existe ya un archivo que se llame así
en ese caso, lo renombra como _1 / _2, el que esté libre, para tener todas las sesiones separadas, pero las mismas lineas juntas.

###########
File SD_card.cpp
	Modified: sd_init
File device.cpp
	Modified: store_session
##########

Vale, todo funciona de manera correcta, ahora el unico problema es que cuando alcanzamos zona yellow, la consola se relantiza, observando el codigo de vibrator.cpp, he visto que 
esto es causado debido a que se utilizan delays para usar el vibrador, lo que bloquea por completo la placa, hasta que termina de vibrar.

###########
File vibrator.cpp
	Commented: I dont know how to do work properly void warning
##########