/**
 * Password Hash Generator for Wergonic Server
 *
 * Usage:
 *   npm run hash-password
 *   or
 *   node scripts/hash-password.js
 *
 * Then copy the generated hash to your .env file
 */

const bcrypt = require('bcrypt');
const readline = require('readline');

const SALT_ROUNDS = 10;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function hideInput(query) {
    return new Promise((resolve) => {
        const stdin = process.stdin;
        const stdout = process.stdout;

        stdout.write(query);

        const password = [];
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        const onData = (char) => {
            switch (char) {
                case '\n':
                case '\r':
                case '\u0004': // Ctrl+D
                    stdin.setRawMode(false);
                    stdin.pause();
                    stdin.removeListener('data', onData);
                    stdout.write('\n');
                    resolve(password.join(''));
                    break;
                case '\u0003': // Ctrl+C
                    process.exit();
                    break;
                case '\u007F': // Backspace
                    if (password.length > 0) {
                        password.pop();
                        stdout.clearLine(0);
                        stdout.cursorTo(0);
                        stdout.write(query + '*'.repeat(password.length));
                    }
                    break;
                default:
                    password.push(char);
                    stdout.write('*');
                    break;
            }
        };

        stdin.on('data', onData);
    });
}

async function main() {
    console.log('\n🔐 Wergonic Password Hash Generator\n');
    console.log('This will generate a bcrypt hash for your .env file.\n');

    try {
        const password = await hideInput('Enter password: ');

        if (password.length < 6) {
            console.error('\n❌ Password must be at least 6 characters long.');
            process.exit(1);
        }

        const confirmPassword = await hideInput('Confirm password: ');

        if (password !== confirmPassword) {
            console.error('\n❌ Passwords do not match.');
            process.exit(1);
        }

        console.log('\nGenerating hash...');
        const hash = await bcrypt.hash(password, SALT_ROUNDS);

        console.log('\n✅ Password hash generated successfully!\n');
        console.log('Add this line to your .env file:\n');
        console.log(`APP_PASSWORD_HASH=${hash}`);
        console.log('\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }

    rl.close();
    process.exit(0);
}

main();
