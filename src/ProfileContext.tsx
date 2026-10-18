import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {readProfile,writeProfile,type GuestProfile} from './profile';
import {setSpeechEnabled} from './speech';
interface Context {profile:GuestProfile;issue:string;update:(change:(p:GuestProfile)=>GuestProfile)=>boolean}
const Profile=createContext<Context|undefined>(undefined);
export function ProfileProvider({children}:{children:ReactNode}){
 const [initial]=useState(readProfile),[profile,setProfile]=useState(initial.profile),[issue,setIssue]=useState(initial.error||'');
 useEffect(()=>setSpeechEnabled(profile.settings.speech),[profile.settings.speech]);
 function update(change:(p:GuestProfile)=>GuestProfile){try{const next=writeProfile(change(profile));setProfile(next);setIssue('');return true;}catch(error){setIssue(error instanceof Error?error.message:'Не удалось сохранить изменения.');return false;}}
 return <Profile.Provider value={{profile,issue,update}}>{children}</Profile.Provider>;
}
export function useProfile(){const value=useContext(Profile);if(!value)throw Error('ProfileProvider is required');return value;}
