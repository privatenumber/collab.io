var express = require('express'),
	http = require('http'),
	path = require('path'),
	app = express(),
	fs = require('fs');

app.configure(function(){
  app.set('port', process.env.PORT || 8081);
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});


var	server = http.createServer(app).listen(app.get('port'), function(){
		console.log("Express server listening on port " + app.get('port'));
	}),
	io = require('socket.io').listen(server, { log: false });

//Prepare Room Logs
io.sockets.manager.roomChat = {};
io.sockets.manager.roomQuestions = {};
io.sockets.manager.roomDrawing = {};


io.sockets.on('connection', function (socket) {
	//Set Socket User
	console.log("New User: " + socket.id);

	//Create Room
	socket.on('createRoom', function(post){
		//Generate Hash for Room
		var roomId = Math.random().toString(36).substr(2, 8);

		//Set Username in Socket
		socket.username = post.name;

		console.log("EVENT: User["+socket.id+"] CREATED Room["+roomId+"] with username["+socket.username+"].");

		//Join Socket Room
		socket.join(roomId);
		socket.roomId = roomId;

		//Prepare Room
		io.sockets.manager.roomChat['/'+roomId] = [];
		io.sockets.manager.roomQuestions['/'+roomId] = [];
		io.sockets.manager.roomDrawing['/'+roomId] = [];

		//Send Back Successful Creation of Room
		var send = {
			roomId: roomId,
			userId: socket.id,
			clients: socket.manager.rooms['/'+roomId]
		};
		socket.emit('roomAvailable', send);
	});

	//Join Room
	socket.on('joinRoom', function(post){

		//Get the Room requested
		var roomUrl = socket.handshake.headers.referer,
			roomId = roomUrl.split('/').pop();

		//Set Username in socket
		socket.username = post.name;

		console.log("EVENT: User["+socket.id+"] JOINED Room["+roomId+"] with username["+socket.username+"].");

		//Join Socket Room
		socket.join(roomId);
		socket.roomId = roomId;

		//Send Back Successful Joining of Room
		var send = {
			roomId: roomId,
			userId: socket.id,
			clients: socket.manager.rooms['/'+roomId]
		};
		socket.emit('roomAvailable', send);

		//Send Latest Chat Logs
		socket.emit('receiveChat', io.sockets.manager.roomChat['/'+roomId]);

		//Send Latest Questions
		socket.emit('receiveQuestions', io.sockets.manager.roomQuestions['/'+roomId]);

		//Send Latest Drawing
		socket.emit('draw', io.sockets.manager.roomDrawing['/'+roomId]);
	});



	//Send Chat Message
	socket.on('sendChat', function (message) {
		var roomChat = io.sockets.manager.roomChat['/'+socket.roomId];
		var log = {
			userId: socket.id,
			userName: socket.username,
			time: (new Date()).getTime(),
			text: message.text
		};
		roomChat.push(log);

		//Send Latest Chat Logs
		io.sockets.in(socket.roomId).emit('receiveChat', [log]);
	});


	/* Questions */

	function inArray(arr, elem){
		return (arr.indexOf(elem) != -1);
	}
	function remElement(arr, elem){
		if( inArray(arr, elem) ){
			var id = arr.indexOf(elem);
			arr.splice(id, 1);
		}
	}
	//Ask Question
	socket.on('askQuestion', function(post) {
		var roomQuestions = io.sockets.manager.roomQuestions['/'+socket.roomId];
		var question = {
			id: roomQuestions.length,
			text: post.question,
			upvotes: [],
			downvotes: [],
			askedBy: socket.id
		};

		roomQuestions.push(question);


		//Send Latest Questions
		io.sockets.in(socket.roomId).emit('receiveQuestions', [question]);
	});

	//Downvote Question
	socket.on('downVote', function(qid){
		var roomQuestions = io.sockets.manager.roomQuestions['/'+socket.roomId];

		//If in upvotes, remove
		var upvotes = roomQuestions[qid].upvotes;
		remElement(upvotes, socket.id);

		//Toggle Downvotes
		var downvotes = roomQuestions[qid].downvotes;
		if( inArray(downvotes, socket.id) ){
			var id = downvotes.indexOf(socket.id);
			downvotes.splice(id, 1);
		}else
			downvotes.push(socket.id);

		//Send Latest Questions
		io.sockets.in(socket.roomId).emit('receiveQuestions', [roomQuestions[qid]]);
	});

	//Upvote Question
	socket.on('upVote', function(qid){
		var roomQuestions = io.sockets.manager.roomQuestions['/'+socket.roomId];

		//If in downvotes, remove
		var downvotes = roomQuestions[qid].downvotes;
		remElement(downvotes, socket.id);

		//Toggle Downvotes
		var upvotes = roomQuestions[qid].upvotes;
		if( inArray(upvotes, socket.id) ){
			var id = upvotes.indexOf(socket.id);
			upvotes.splice(id, 1);
		}else
			upvotes.push(socket.id);

		//Send Latest Questions
		io.sockets.in(socket.roomId).emit('receiveQuestions', [roomQuestions[qid]]);
	});


	//Remove Question
	socket.on('removeQuestion', function(qid) {
		var roomQuestions = io.sockets.manager.roomQuestions['/'+socket.roomId];
		var roomAdmin = socket.manager.rooms['/'+socket.roomId][0];

		if( roomAdmin == socket.id || roomQuestions[qid].askedBy == socket.id ){
			delete roomQuestions[qid];
		}

		//Send Latest Questions
		io.sockets.in(socket.roomId).emit('deleteQuestion', qid);
	});



	/* Drawing */
	socket.on('drawClick', function(data) {
		var roomDrawing = io.sockets.manager.roomDrawing;

		/* Not sure what purpose this serves */
		//if (data[0].color == "#fff") {
		//	roomDrawing = [];
		//}
		roomDrawing['/'+socket.roomId] = roomDrawing['/'+socket.roomId].concat(data);

		//Send Latest Drawing
		io.sockets.in(socket.roomId).emit('draw', data);
	});


	//Evernote
	socket.on('evernoteSave', function(data) {

		console.log("Saving to evernote...");
		var base64Data = data.path.replace(/^data:image\/png;base64,/, "");
		require("fs").writeFile("./images/"+user.roomId+".png", base64Data, 'base64', function(err) {
			console.log(err);
		});

		//var spawn = require('child_process').spawn;
		//var evernote = spawn('python', ['./evernote/EDAMTest.py',require('path').dirname(require.main.filename)+"/images/"+user.roomId+".png", rooms[user.roomId].questions[data.qid].text, rooms[user.roomId].questions[data.qid]].text);

		var sys = require('sys')
		var exec = require('child_process').exec;
		function puts(error, stdout, stderr) { sys.puts(stdout) }

		console.log(rooms[user.roomId].questions[data.qid].text);
		exec("python '"+require('path').dirname(require.main.filename)+"/evernote/EDAMTest.py' '"+require('path').dirname(require.main.filename)+"/images/"+user.roomId+".png' '"+rooms[user.roomId].questions[data.qid].text+"' '"+rooms[user.roomId].questions[data.qid].text+"'", puts);
	});


	socket.on('disconnect', function(){
		if( socket.roomId == undefined ) return;

		console.log(socket.id+"["+socket.username+"] has left the Room["+socket.roomId+"].");
		socket.leave(socket.roomId);
		if( socket.manager.rooms["/"+socket.roomId] == undefined ){
			console.log("No one in Room["+socket.roomId+"]. Deleting Logs.");
			//Delete Room Chat
			delete io.sockets.manager.roomChat['/'+socket.roomId];

			//Delete Room Questions
			delete io.sockets.manager.roomQuestions['/'+socket.roomId];

			//Delete Room Drawing
			delete io.sockets.manager.roomDrawing['/'+socket.roomId];
		}
	});
});



//Create Room
app.get('/', function(req, res){
	res.sendfile('./routes/index.html');
});

//iPhone Canvas
app.get('/r/:id/:user', function(req, res){
	//Verify that the ids and the user exists
	res.sendfile('./routes/index.html');
});

//Join Room
app.get('/r/:id', function(req, res){
	var roomId = req.params.id;
	console.log("Trying to join room: "+roomId);

	if( !io.sockets.manager.rooms['/'+roomId] ){
		console.log("Room "+roomId+" doesnt exist!");
		res.redirect('/');
	}else{
		//Show Page
		res.sendfile('./routes/index.html');
	}
});


