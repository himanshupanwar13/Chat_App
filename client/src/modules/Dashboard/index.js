import Avatar from '../../assets/avatar.svg';
import img1 from '../../assets/img1.jpeg';
import Input from "../../components/input";
import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const Dashboard = () => {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user:detail')));
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState({ messages: [], receiver: null });
  const [message, setMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [socket, setSocket] = useState(null);
  const messageRef = useRef(null);

  console.log('messages: ', messages);

  useEffect(() => {
    setSocket(io('https://chatterflow.onrender.com/'));
  }, []);

  // Handle incoming messages from socket
  useEffect(() => {
    if (!socket) return;

    socket.on('getMessage', (data) => {
      setMessages((prev) => ({
        ...prev,
        messages: [...prev.messages, { user: data.user, message: data.message }],
      }));
    });

    return () => {
      socket.off('getMessage');
    };
  }, [socket]);

  // Fetch conversations on load
  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const loggedInUser = JSON.parse(localStorage.getItem('user:detail'));
        const res = await fetch(`https://chatterflow.onrender.com/api/conversations/${loggedInUser?.id}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error('Failed to fetch conversations');
        const resData = await res.json();
        setConversations(resData);
      } catch (error) {
        console.error(error);
      }
    };
    fetchConversations();
  }, []);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    messageRef?.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages?.messages]);

  // Fetch users to message
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch(`https://chatterflow.onrender.com/api/users/${user?.id}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error('Failed to fetch users');
        const resData = await res.json();
        setUsers(resData);
      } catch (error) {
        console.error(error);
      }
    };
    if (user?.id) fetchUsers();
  }, [user]);

  // Fetch messages for a conversation
  const fetchMessages = async (conversationId, receiver) => {
    try {
      const res = await fetch(`https://chatterflow.onrender.com/api/message/${conversationId}?senderId=${user?.id}&&receiverId=${receiver?.receiverId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to fetch messages');
      const resData = await res.json();
      setMessages({ messages: resData, receiver, conversationId });
    } catch (error) {
      console.error(error);
    }
  };

  // Handle sending messages
  const sendMessage = async (e) => {
    e.preventDefault();

    if (!message) return;

    const newMessage = { user: { id: user?.id }, message };

    // Optimistically add the message to the UI
    setMessages((prev) => ({
      ...prev,
      messages: [...prev.messages, newMessage],
    }));

    try {
      // Emit the message to the server (Socket.IO)
      socket?.emit('sendMessage', {
        senderId: user?.id,
        receiverId: messages?.receiver?.receiverId,
        message,
        conversationId: messages?.conversationId,
      });

      // Send the message via the API
      const res = await fetch(`https://chatterflow.onrender.com/api/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: messages?.conversationId,
          senderId: user?.id,
          message,
          receiverId: messages?.receiver?.receiverId,
        }),
      });

      if (!res.ok) throw new Error('Failed to send message');
      setMessage('');  // Clear input field
    } catch (error) {
      console.error(error);
      // Optionally handle the failure by reverting the optimistic update
    }
  };

  return (
    <div className='w-screen flex overflow-hidden'>
      <div className='w-[25%] h-screen bg-purple-300'>
        <div className='flex items-center my-8 mx-14'>
          <div className='border border-primary p-[2px] rounded-full'>
            <img alt="logo" src={Avatar} width={75} height={75} />
          </div>
          <div className='ml-8'>
            <h3 className='text-2xl'>{user?.fullName}</h3>
            <p className='text-lg font-light'>My Account</p>
          </div>
        </div>
        <hr />
        <div className='mx-10 mt-8 overflow-y-scroll sidebar-scrollable h-[calc(100vh-160px)]'>
          <div className='text-primary text-xl font-semibold'>Messages</div>
          <div>
            {conversations.length > 0 ? (
              conversations.map(({ conversationId, user }) => (
                <div
                  key={conversationId}
                  className='flex items-center py-8 border-b border-b-purple-700'
                >
                  <div
                    className='cursor-pointer flex items-center'
                    onClick={() => fetchMessages(conversationId, user)}
                  >
                    <div>
                      <img
                        alt="logo"
                        src={img1}
                        className='w-[60px] h-[60px] rounded-full p-[2px] border border-primary'
                      />
                    </div>
                    <div className='ml-6'>
                      <h3 className='text-lg font-semibold'>{user?.fullName}</h3>
                      <p className='text-sm font-light text-gray-600'>{user?.email}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className='text-center text-lg font-semibold mt-24'>No Conversation</div>
            )}
          </div>
        </div>
      </div>

      <div className='w-[50%] h-screen bg-purple-100 flex flex-col items-center'>
        {messages?.receiver?.fullName && (
          <div className='w-[75%] bg-purple-300 h-[80px] my-14 rounded-full flex items-center px-14 mb-2 py-2'>
            <div className='cursor-pointer'>
              <img alt="logo" src={Avatar} width={60} height={60} />
            </div>
            <div className='ml-6 mr-auto'>
              <h3 className='text-lg'>{messages?.receiver?.fullName}</h3>
              <p className='text-sm font-light text-gray-600'>{messages?.receiver?.email}</p>
            </div>
            <div className='cursor-pointer'>
              <svg xmlns="http://www.w3.org/2000/svg" className="icon icon-tabler icon-tabler-phone-outgoing" width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.5" stroke="black" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />
                <path d="M15 9l5 -5" />
                <path d="M16 4l4 0l0 4" />
              </svg>
            </div>
          </div>
        )}
        <div className='h-[75%] w-full overflow-auto rounded-lg shadow-sm custom-scrollbar'>
          <div className='p-14'>
            {messages?.messages?.length > 0 ? (
              messages.messages.map(({ message, user: { id } = {} }) => (
                <div ref={messageRef} key={id}>
                  <div
                    className={`max-w-[40%] mt-6 ${id === user.id ? 'ml-auto bg-purple-300' : 'bg-gray-200'} p-4 rounded-lg`}
                  >
                    <p>{message}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className='text-center'>No Messages</div>
            )}
          </div>
        </div>
        <div className='w-full h-[50px] bg-purple-300 flex items-center justify-between px-14'>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(e); }}
          />
          <button
            onClick={sendMessage}
            className='w-12 h-12 rounded-full bg-purple-700 text-white flex justify-center items-center'
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="icon icon-tabler icon-tabler-send" width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M10 14l11 -11" />
              <path d="M21 3l-5 5" />
              <path d="M14 10l-11 11" />
            </svg>
          </button>
        </div>
      </div>

      <div className='w-[25%] h-screen bg-gray-300'>
        <div className='flex items-center justify-center h-[90vh]'>
          <div className='w-[90%]'>
            <h1 className='text-xl font-semibold text-center'>Profile Information</h1>
            <div className='bg-white mt-8 p-4 rounded-md'>
              <p className='text-lg font-semibold'>Full Name: {user?.fullName}</p>
              <p className='text-lg font-semibold'>Email: {user?.email}</p>
              <p className='text-lg font-semibold'>Phone: {user?.phone}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
