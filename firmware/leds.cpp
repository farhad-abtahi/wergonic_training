#include "leds.h"

// Support for the LEDs functionality of Wergonic device.//

void ledsOff()
{
    digitalWrite(LED_BUILTIN, HIGH);
    digitalWrite(LEDG, HIGH);
    digitalWrite(LEDB, HIGH);
}

void toggleLed()
{
    digitalWrite(LEDG, LOW);
    delay(1000);
    ledsOff();
    delay(1000);
}

void ledsConnect()
{
    digitalWrite(LEDG, LOW);
    delay(200);
    ledsOff();
    delay(200);
    digitalWrite(LEDG, LOW);
    delay(200);
    ledsOff();
    digitalWrite(LEDG, LOW);
}

void ledsConnected() { digitalWrite(LEDG, LOW); }

void ledsCalib()
{
    ledsOff();
    digitalWrite(LEDB, LOW);
}
