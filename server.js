const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors'); // Import the cors module

const app = express();
const server = http.createServer(app);

const io = require('socket.io')(server, {
  cors: {
    origin: 'https://woolfgame.com', // Replace with your client's origin
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: 'https://woolfgame.com', // Replace with your client's origin
  methods: ['GET', 'POST'],
  credentials: true,
  optionsSuccessStatus: 204,
}));

const gameRooms = new Map();

const gameTopics = ['Countries', 'Instruments', 'Geography', 'Animals', 'Artists', 'Sports', 'Apps', 'Weather', 'Music'];

const gameBoards = new Map();
gameBoards.set('Countries', ['United States', 'England', 'Jamaica', 'France', 'Australia', 'Spain', 'Mexico', 'Italy', 'Argentina']);
gameBoards.set('Instruments', ['Guitar', 'Piano', 'Drums', 'Violin', 'Voice', 'Saxophone', 'Flute', 'Trumpet', 'Ukulele']);
gameBoards.set('Geography', ['Ocean', 'Desert', 'Forest', 'Jungle', 'Mountain', 'Lake', 'Swamp', 'Cave', 'Island']);
gameBoards.set('Animals', ['Elephant', 'Giraffe', 'Lion', 'Wolf', 'Tiger', 'Eagle', 'Owl', 'Gorilla', 'Bear']);
gameBoards.set('Artists', ['Taylor Swift', 'The Weeknd', 'Drake', 'Post Malone', 'Billie Eilish', 'Ed Sheern', 'Bad Bunny', 'Harry Styles', 'Miley Cyrus']);
gameBoards.set('Sports', ['Soccer', 'American Football', 'Rugby', 'Tennis', 'Track & Field', 'Golf', 'Volleyball', 'Basketball', 'Cricket']);
gameBoards.set('Apps', ['Spotify', 'Instagram', 'TikTok', 'Facebook', 'WhatsApp', 'Gmail', 'Discord', 'Snapchat', 'YouTube']);
gameBoards.set('Weather', ['Rain', 'Fog', 'Sunny', 'Cloudy', 'Windy', 'Hail', 'Snow', 'Storm', 'Heat Wave']);
gameBoards.set('Music', ['Pop', 'Hip Hop', 'Trap', 'R&B', 'Country', 'Gospel', 'Indie', 'Rock', 'Lofi']);

const gameVotes = new Map();

const newGameRequests = new Map();

function getMostVotedName(votes) {
  const voteCounts = {};
  votes.forEach((name) => {
    voteCounts[name] = (voteCounts[name] || 0) + 1;
  });

  let mostVotedName = null;
  let maxVotes = 0;

  for (const name in voteCounts) {
    if (voteCounts[name] > maxVotes) {
      mostVotedName = name;
      maxVotes = voteCounts[name];
    }
  }

  return mostVotedName;
}

app.get('/', (req, res) => {
  res.send('Server is running.');
});

io.on('connection', (socket) => {

  //Create room
  socket.on('createRoom', (roomID, userName, callback) => {

    //If room already exists, return
    if (gameRooms.has(roomID)) {
      return;
    }
    //Else create room and join
    const room = [{id: socket.id, userName: userName, room: roomID, host: true}]
    gameRooms.set(roomID, room);
    socket.join(roomID);
    callback(room);
  });
  
  
  //Verify request to join room
  socket.on('verifyJoinRoom', (roomID, callback) => {
    if (gameRooms.has(roomID)) {
      const room = gameRooms.get(roomID);
      if (room.length >= 8) {
        callback(false);
      }
      callback(true); 
    } else {
      callback(false);
    }
  });

  //Join room
  socket.on('joinRoom', (roomID, userName) => {
    socket.join(roomID);
    const room = gameRooms.get(roomID);
    room.push({id: socket.id, userName: userName, room: roomID, host: false});
    gameRooms.set(roomID, room);
    io.to(roomID).emit('updateRoom', room);
  });

  //NEED TO UNDERSTAND WHY THIS FUNCTION IS NEEDED
  socket.on('getRoom', (roomID) => {
    room = gameRooms.get(roomID);
    socket.emit('updateRoom', room);
  });

  socket.on('startGame', (roomID) => {
    
    gameData = {
      players: null,
      topic: null,
      board: null,
      answer: null
    };

    //Shuffle player order
    let playerList = gameRooms.get(roomID).slice(0);
    for (var i = playerList.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = playerList[i];
      playerList[i] = playerList[j];
      playerList[j] = temp;
    }

    gameData.players = playerList;

    //AShuffle categories and select topic (TO BE IMPLEMENTED)
    let gameTopicIndex = Math.floor(Math.random() * (gameTopics.length));
    let chosenTopic = gameTopics[gameTopicIndex];
    
    gameData.topic = chosenTopic;    
    gameData.board = gameBoards.get(chosenTopic);

    //Shuffle board words and select answer
    let boardWords = gameBoards.get(chosenTopic).slice(0);
    for (var i = boardWords.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = boardWords[i];
      boardWords[i] = boardWords[j];
      boardWords[j] = temp;
    }

    gameData.answer = boardWords[0];
    
    //Select player roles
    let woolfIndex = Math.floor(Math.random() * (playerList.length));
    for (let i = 0; i < playerList.length; i++) {
      if (i == woolfIndex){
        playerList[i].role = 'WOOLF';
      } else {
        playerList[i].role = 'SHEEP';
      }
    }

    io.to(roomID).emit('gameStarted', gameData);

  });
  
  socket.on('clueSubmitted', (clue, name, roomID) => {
    io.to(roomID).emit("newClue", clue, name);
  });

  socket.on('incrementTurn', (newTurnNumber, roomID) => {
    io.to(roomID).emit('updateTurn', newTurnNumber);
  });

  socket.on('allTurnsComplete', (roomID) => {
    io.to(roomID).emit('startVoting');
  });

  socket.on('playerVoted', (roomID, vote, order) => {

    if (!gameVotes.has(roomID)){
      gameVotes.set(roomID, []);
    }

    const votes = gameVotes.get(roomID);
    votes.push(vote);
    gameVotes.set(roomID, votes);

    if (votes.length === order.length) {
      const mostVoted = getMostVotedName(votes);
      io.to(roomID).emit('revealAnswer', mostVoted);

      gameVotes.set(roomID, []);
    }

  });

  socket.on('playerReady', (roomID, userName, order) => {

    if (!newGameRequests.has(roomID)){
      newGameRequests.set(roomID, [])
    }

    const requested = newGameRequests.get(roomID);
    requested.push(userName);
    newGameRequests.set(roomID, requested);

    if (requested.length === order.length) {
      io.to(roomID).emit('newRound');
      newGameRequests.set(roomID, []);
    }
    
  });

  socket.on('resetGame', (roomID) => {
    const room = gameRooms.get(roomID);
    io.to(roomID).emit('updateRoom', room);
  });

  socket.on('disconnect', () => {

    //find room of socket that disconnected
    for (const [room, players] of gameRooms) {
      const disconnectedPlayer = players.find(player => player.id === socket.id);

      if (disconnectedPlayer) {
        const updatedRoom = players.filter(player => player.id !== socket.id);

        //if room now empty
        if (updatedRoom.length == 0){
          gameRooms.delete(disconnectedPlayer.room)
          return;
        }

        if (disconnectedPlayer.host){
          updatedRoom[0].host = true;
        }

        gameRooms.set(disconnectedPlayer.room, updatedRoom);
        //update all players in room with new list
        io.to(disconnectedPlayer.room).emit('playerDisconnected', updatedRoom, disconnectedPlayer.userName, disconnectedPlayer.id);

      }
    }
   
  });

});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

