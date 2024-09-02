import './App.css';
import Dashboard from './modules/Dashboard';
import Form from './modules/Form';
import {Routes, Route} from 'react-router-dom'

function App() {
  return (
    <Routes>
      <Route path='/' element={<Dashboard/>}/>
      <Route path='/users/sign_in' element={<Form isSignInPage={true}/>}/>
      <Route path='/users/sign_up' element={<Form isSignInPage={false}/>}/>
    </Routes>
  
  );
}

export default App;
