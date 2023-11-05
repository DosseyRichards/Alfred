  const express = require('express');
const path = require('path');
const openai = require('openai-node');
const { spawn } = require('child_process');
const { google } = require('googleapis');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const app = express();

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Set up OpenAI API key
openai.api_key = '';

// Set up Google Search API key and CX
const googleSearchApiKey = 'AIzaSyDWb0d2x_4jSV5Dln1KO8odMBUv6vxaEAU';
const cx = '36af1048a619649b9';

const searchKeywords = ['do a search'];
const taskPhrases = ['do a task for me', 'do this for me'];

let autoGptProcess;

function startAutoGptProcess() {
  const autoGptProcess = spawn('docker-compose', ['run','--rm' ,'auto-gpt','--gpt3only' ,'--continuous'], { cwd: './Alfred-AutoGPT/autogpts/autogpt' });
  const infoKeywords = ["REASONING:", "ACTION:", "SYSTEM", "DOGPROGPT THOUGHTS:", "CRITICISM:", "PLAN: :", "success", "Creating"];

  autoGptProcess.stdout.on('data', (data) => {

    // Check for the "Continue (y/n):" prompt
    if (data.toString().includes("Continue (y/n):")) {
      autoGptProcess.stdin.write('n\n');
    }

    if (infoKeywords.some(keyword => data.toString().includes(keyword))) {
       console.log(`Alfred: ${data}`);
    }

    else if (data.toString().includes("Continue with these settings? [Y/n]")) {
      autoGptProcess.stdin.write('\n');
    }
    else if (data.toString().includes("press enter to keep current)")) {
      autoGptProcess.stdin.write('\n');
    }

  });

  autoGptProcess.stderr.on('data', (data) => {
    //console.error(`stderr: ${data}`);
    //io.emit('terminal response', data.toString());
  });

  autoGptProcess.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
    io.emit('terminal response', `Process exited with code ${code}`);
  });

  return autoGptProcess;
}
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views/index.html'));
});



async function transcribeToAlfredsVoice(rawOutput) {
  console.log("text to transcribe", rawOutput, "end of transcription");
  const thoughtsRegex = /THOUGHTS:\s*([\s\S]*?)\nREASONING:/gm;
  const reasoningRegex = /REASONING:\s*([\s\S]*?)\nPLAN:/gm;
  const planRegex = /PLAN:\s*([\s\S]*?)\nCRITICISM:/gm;
  const criticismRegex = /CRITICISM:\s*([\s\S]*?)$/gm;

  const thoughts = thoughtsRegex.exec(rawOutput)?.[1]?.trim() || '';
  const reasoning = reasoningRegex.exec(rawOutput)?.[1]?.trim() || '';
  const plan = planRegex.exec(rawOutput)?.[1]?.trim() || '';
  const criticism = criticismRegex.exec(rawOutput)?.[1]?.trim() || '';

  const extractedText = `Thoughts: ${thoughts}\nReasoning: ${reasoning}\nPlan: ${plan}\nCriticism: ${criticism}`;

  try {
  const response = await openai.Completion.create({
    engine: 'davinci-codex',
    prompt: `You are a butler named Alfred. My name is Dossey Richards, I am a Man. and you work for me. Be polite and answer all questions with a one-sentence answer that is very accurate. Try to greet me properly as a butler would. Transcribe the following thoughts, reasoning, plan, and criticism in a polite and human-readable manner,.Content:\n\n"${extractedText}, "\n\nAlfred's response:`,
    max_tokens: 150,
    n: 1,
    stop: null,
    temperature: 0.7,
  });
  console.log("response object", response)
  const generalMessage = thoughts + reasoning + plan; 
  return generalMessage;
} catch (error) {
  console.error("Error in the AI request:", error);
  console.log("response body", response); 
  // Handle the error as needed
}
}


app.post('/process-voice', async (req, res) => {
  const message = req.body.text;
  const keywordFound = searchKeywords.find((keyword) => message.toLowerCase().includes(keyword));
  const taskPhraseFound = taskPhrases.find((phrase) => message.toLowerCase().includes(phrase));

  if (keywordFound) {
    // Google Search related functionality
    try {
      const searchQuery = message.replace(keywordFound, '').trim();
      const customsearch = google.customsearch('v1');
      const searchResult = await customsearch.cse.list({
        cx: cx,
        q: searchQuery,
        auth: googleSearchApiKey,
      });
      const searchItems = searchResult.data.items;

      if (searchItems && searchItems.length > 0) {
        const firstResult = searchItems[0].snippet;

        // Use OpenAI API to rephrase the search result snippet
        const rephraseResponse = await openai.Completion.create({
          engine: 'davinci',
          prompt: `Please rephrase the following text in a human-readable and relevant manner basedon the query. Query: "${searchQuery}"\nText: "${firstResult}"\nRephrased:`,
max_tokens: 100,
n: 1,
stop: ["Rephrased:"],
temperature: 0.7,
});    const rephrasedSnippet = rephraseResponse.choices[0].text.trim();
    res.send(rephrasedSnippet.substring(0, rephrasedSnippet.indexOf('Text')));
  } else {
    res.send("I'm sorry, I couldn't find any relevant information.");
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  res.send(`Error: ${error.message}`);
}} else if (taskPhraseFound) {
    // Task related functionality
  console.log("task phrase found")
    const task = message.replace(taskPhraseFound, '').trim();
    res.send("Of course Master Richards. Right away!")
    autoGptProcess.stdout.once('data', async (data) => {
      console.log(`stdout: ${data}`);
      const alfredResponse = await transcribeToAlfredsVoice(data.toString());
      // res.send(alfredResponse);
      console.log(alfredResponse);

    });

    autoGptProcess.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
      io.emit(' 2 terminal response', data.toString());
    });

    autoGptProcess.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
      io.emit('terminal response', `Process exited with code ${code}`);
    });

    autoGptProcess.stdin.write(`${message}\n`);

} else {
// OpenAI API related functionality
const response = await openai.Completion.create({
engine: 'davinci',
prompt: `You are a butler named Alfred. You work for Dossey Richards, I am a Man. and you work for me. Be polite and answer all questions with a one to three sentence answer that is very accurate. Try to greet me properly as a butler would. Me: ${message}\nYou:`,
max_tokens: 150,
n: 1,
stop: null,
temperature: 0.7,
});
const assistantMessage = response.choices[0].text.trim();
console.log(response);
res.send(assistantMessage.substring(0, assistantMessage.indexOf('Me')));
}
});

let rawOutputArray = [];

io.on('connection', (socket) => {
  console.log('A user connected');

  autoGptProcess.stdout.on('data', async (data) => {
    console.log(`stdout: ${data}`);
    rawOutputArray.push(data.toString());
    io.emit('terminal response', data.toString());

    // Check for the "Using memory of type")" term
    if (data.toString().includes("Using memory of type")) {
      console.log("beginning of data", data, "end of data");
      const alfredResponse = await transcribeToAlfredsVoice(rawOutputArray);
      console.log("beginning of response", alfredResponse, "end of response");

      res.send(alfredResponse);
      rawOutputArray = []; // Reset the raw output array
    }
  });

  // socket.on('user input', (input) => {
  //   console.log(`User input: ${input}`);
  //   // Send user input to the Auto-GPT process
  //   autoGptProcess.stdin.write(`${input}\Y`);
  // });
socket.on('disconnect', () => {
console.log('User disconnected');
});
});

server.listen(3000, () => {
  console.log('Listening on port 3000');
  autoGptProcess = startAutoGptProcess();
});

