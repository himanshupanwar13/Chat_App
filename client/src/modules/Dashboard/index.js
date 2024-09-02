import Avatar from '../../assets/avatar.svg'
import Input from "../../components/input"
import React from 'react'
const Dashboard = () => {
  const contacts = [
    {
      name: 'Rajpal',
      status: 'Available',
      img: Avatar
    },
    {
      name: 'Arti',
      status: 'Available',
      img: Avatar
    },
    {
      name: 'Alex',
      status: 'Available',
      img: Avatar
    },
    {
      name: 'John',
      status: 'Available',
      img: Avatar
    },
    {
      name: 'Rohan',
      status: 'Available',
      img: Avatar
    },
    {
      name: 'Pritam',
      status: 'Available',
      img: Avatar
    }
  ]
  return (
    <div className='w-screen flex overflow-hidden'>

<div className='w-[25%] h-screen bg-purple-300'>
<div className='flex items-center my-8 mx-14'>
  <div className='border border-primary p-[2px] rounded-full'>
    <img alt="logo" src={Avatar} width={75} height={75} />
  </div>
  <div className='ml-8'>
    <h3 className='text-2xl'>Chatting App</h3>
    <p className='text-lg font-light'>My Account</p>
  </div>
</div>
<hr />
<div className='mx-14 mt-8 overflow-y-scroll sidebar-scrollable  h-[calc(100vh-160px)]'>
  <div className='text-primary text-xl font-semibold'>Messages</div>
  <div>
    {contacts.map(({ name, status, img }) => (
      <div className='flex items-center py-8 border-b border-b-purple-700' key={name}>
        <div className='cursor-pointer flex items-center'>
          <div><img alt="logo" src={img} width={60} height={60} /></div>
          <div className='ml-6'>
            <h3 className='text-lg font-semibold'>{name}</h3>
            <p className='text-sm font-light text-gray-600'>{status}</p>
          </div>
        </div>
      </div>
    ))}
  </div>
</div>
</div>
      <div className='w-[50%] h-screen bg-purple-100 flex flex-col items-center'>
        <div className='w-[75%] bg-purple-300 h-[80px] my-14 rounded-full flex items-center px-14 mb-2'>
          <div className='cursor-pointer'><img alt="logo" src={Avatar} width={60} height={60} /></div>
          <div className='ml-6 mr-auto'>
            <h3 className='text-lg'>Rajpal</h3>
            <p className='text-sm font-light text-gray-600'>online</p>
          </div>
          <div className='cursor-pointer'>
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-phone-outgoing" width="24" height="24" viewBox="0 0 24 24" stroke-width="1.5" stroke="black" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />
              <path d="M15 9l5 -5" />
              <path d="M16 4l4 0l0 4" />
            </svg>
          </div>
        </div>
        <div className='h-[75%] w-full overflow-auto rounded-lg shadow-sm  custom-scrollbar'>
          <div className='p-14'>
            <div className='max-w-[40%] bg-purple-200 rounded-b-xl rounded-tr-xl p-4 mb-6'>
              Lorem Ipsum is simply dummy text of the printing and the typesetting of the industry.
            </div>
            <div className='max-w-[40%] bg-violet-400 rounded-b-xl rounded-tl-xl ml-auto p-4 text-white mb-6'>
              Lorem Ipsum is simply dummy text.
            </div>
            <div className='max-w-[40%] bg-purple-200 rounded-b-xl rounded-tr-xl p-4 mb-6'>
              Lorem Ipsum is simply dummy text of the printing and the typesetting of the industry.
            </div>
            <div className='max-w-[40%] bg-violet-400 rounded-b-xl rounded-tl-xl ml-auto p-4 text-white mb-6'>
              Lorem Ipsum is simply dummy text.
            </div>
            <div className='max-w-[40%] bg-purple-200 rounded-b-xl rounded-tr-xl p-4 mb-6'>
              Lorem Ipsum is simply dummy text of the printing and the typesetting of the industry.
            </div>
            <div className='max-w-[40%] bg-violet-400 rounded-b-xl rounded-tl-xl ml-auto p-4 text-white'>
              Lorem Ipsum is simply dummy text.
            </div>
            <div className='max-w-[40%] bg-purple-200 rounded-b-xl rounded-tr-xl p-4 mb-6'>
              Lorem Ipsum is simply dummy text of the printing and the typesetting of the industry.
            </div>
            <div className='max-w-[40%] bg-violet-400 rounded-b-xl rounded-tl-xl ml-auto p-4 text-white'>
              Lorem Ipsum is simply dummy text.
            </div>
            
          </div>
        </div>
        <div className='p-14 w-full flex items-center'>
          <div className='w-[75%]'>
            <Input placeholder='Type a message...' className='w-full p-4 border-0 shadow-lg rounded-full bg-black focus:ring-purple-300 focus:border-0' />
          </div>
          <div className='ml-4 p-2 cursor-pointer bg-white rounded-full'>
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="purple" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon icon-tabler icon-tabler-send">
              <path stroke="none" d="M0 0h24v24H0z" fill="none" />
              <path d="M10 14l11 -11" />
              <path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" />
            </svg>
          </div>
          <div className='ml-4 p-2 cursor-pointer bg-white rounded-full'>
          <svg  xmlns="http://www.w3.org/2000/svg"  width="30"  height="30"  viewBox="0 0 24 24"  fill="none"  stroke="purple"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-paperclip"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5" /></svg>
          </div>
        </div>
      </div>
      <div className='w-[25%] h-screen bg-purple-300'></div>
    </div>
  )
}

export default Dashboard