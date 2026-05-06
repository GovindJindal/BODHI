/**
 * TravelBookingScreen.tsx
 * BODHI App — Premium Travel Booking
 * React Native 0.73 | 4-screen flow: Home → Results → Details → Confirm
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
  Image,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import { isTablet, isLandscape, responsiveFont, responsiveWidth, responsiveHeight } from '../utils/responsive';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  Plane,
  Search,
  MapPin,
  Calendar,
  Users,
  Clock,
  X,
  User,
  Mail,
  Phone,
  ArrowRight,
  CheckCircle,
  ExternalLink,
  ChevronRight,
  ArrowLeftRight,
  Star,
  Train,
  Bus,
  Hotel,
  Ship,
  AlertCircle,
} from 'lucide-react-native';
import { TravelAPI } from '../api/client';
import { Colors, Spacing, Radius } from '../theme/tokens';

const { width: W } = Dimensions.get('window');

// ─── TYPES ───────────────────────────────────────────────────────────────────
type ScreenType = 'home' | 'results' | 'details' | 'confirm';
type CategoryType = 'flights' | 'trains' | 'bus' | 'hotel' | 'cruise';
type ClassType = 'Economy' | 'Premium Economy' | 'Business' | 'First';

interface Airport {
  sky_id: string;
  entity_id: string;
  title: string;
  subtitle: string;
}

interface Flight {
  id: string;
  price: string;
  price_raw: number;
  airline: string;
  airline_logo: string;
  departure: string;
  arrival: string;
  duration_minutes: number;
  stops: number;
  origin_code: string;
  origin_name: string;
  dest_code: string;
  dest_name: string;
}

interface TimeSlot {
  time: string;
  seats: number;
  isLow: boolean;
}

// ─── WORLD AIRPORTS DATABASE ────────────────────────────────────────────────
const AIRPORTS_DB: Airport[] = [
  { sky_id: 'DEL', entity_id: '95673320', title: 'Delhi (Indira Gandhi Intl)', subtitle: 'DEL · New Delhi, India' },
  { sky_id: 'BOM', entity_id: '95673529', title: 'Mumbai (Chhatrapati Shivaji)', subtitle: 'BOM · Mumbai, India' },
  { sky_id: 'BLR', entity_id: '95674531', title: 'Bengaluru (Kempegowda Intl)', subtitle: 'BLR · Bengaluru, India' },
  { sky_id: 'DXB', entity_id: '95673333', title: 'Dubai International', subtitle: 'DXB · Dubai, UAE' },
  { sky_id: 'SIN', entity_id: '95673537', title: 'Singapore Changi', subtitle: 'SIN · Singapore' },
  { sky_id: 'LHR', entity_id: '95565050', title: 'London Heathrow', subtitle: 'LHR · London, UK' },
  { sky_id: 'JFK', entity_id: '95565041', title: 'New York JFK', subtitle: 'JFK · New York, USA' },
  { sky_id: 'DPS', entity_id: '95673331', title: 'Bali Ngurah Rai Intl', subtitle: 'DPS · Bali, Indonesia' },
];

const POPULAR_ROUTES = [
  { fromSkyId: 'DEL', toSkyId: 'BOM', label: 'Delhi → Mumbai', price: '₹3,299' },
  { fromSkyId: 'BOM', toSkyId: 'GOI', label: 'Mumbai → Goa', price: '₹2,199' },
  { fromSkyId: 'DEL', toSkyId: 'DXB', label: 'Delhi → Dubai', price: '₹12,499' },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return iso; }
}
function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const generateTimeSlots = (): TimeSlot[] => [
  { time: '06:00 AM', seats: 48, isLow: false },
  { time: '08:30 AM', seats: 12, isLow: true },
  { time: '02:00 PM', seats: 5, isLow: true },
  { time: '09:30 PM', seats: 24, isLow: false },
];

const CATEGORIES = [
  { id: 'flights' as CategoryType, label: 'Flights', Icon: Plane, available: true },
  { id: 'trains' as CategoryType, label: 'Trains', Icon: Train, available: false },
  { id: 'bus' as CategoryType, label: 'Bus', Icon: Bus, available: false },
];

const FLIGHT_CLASSES: ClassType[] = ['Economy', 'Premium Economy', 'Business', 'First'];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export const TravelBookingScreen = () => {
  const navigation = useNavigation();

  // Screen state
  const [screen, setScreen] = useState<ScreenType>('home');
  const [category, setCategory] = useState<CategoryType>('flights');

  // Search state
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [fromAirport, setFromAirport] = useState<Airport | null>(null);
  const [toAirport, setToAirport] = useState<Airport | null>(null);
  const [fromSuggestions, setFromSuggestions] = useState<Airport[]>([]);
  const [toSuggestions, setToSuggestions] = useState<Airport[]>([]);
  const [fromFocused, setFromFocused] = useState(false);
  const [toFocused, setToFocused] = useState(false);
  const [travelDate, setTravelDate] = useState('');
  const [pax, setPax] = useState(1);

  // Results state
  const [loading, setLoading] = useState(false);
  const [flights, setFlights] = useState<Flight[]>([]);

  // Details state
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassType>('Economy');
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [timeSlots] = useState<TimeSlot[]>(generateTimeSlots());

  // Passenger state
  const [passengerName, setPassengerName] = useState('');
  const [passengerEmail, setPassengerEmail] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');

  const debounceRef = useRef<any>(null);

  const handleSearchAirports = useCallback((text: string, field: 'from' | 'to') => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 2) {
      field === 'from' ? setFromSuggestions([]) : setToSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await TravelAPI.searchAirports(text);
        const list = (data.results || []).slice(0, 6);
        field === 'from' ? setFromSuggestions(list) : setToSuggestions(list);
      } catch {
        // Fallback to local match
        const local = AIRPORTS_DB.filter(a => a.title.toLowerCase().includes(text.toLowerCase())).slice(0, 5);
        field === 'from' ? setFromSuggestions(local) : setToSuggestions(local);
      }
    }, 400);
  }, []);

  const [sessionId, setSessionId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!fromAirport || !toAirport) { Alert.alert('Missing Fields', 'Select origin and destination.'); return; }
    if (!travelDate) { Alert.alert('Missing Date', 'Enter travel date (YYYY-MM-DD).'); return; }
    setLoading(true);
    setErrorMessage(null); // Reset before new search
    try {
      const data = await TravelAPI.searchFlights({
        origin_sky_id: fromAirport.sky_id,
        destination_sky_id: toAirport.sky_id,
        origin_entity_id: fromAirport.entity_id,
        destination_entity_id: toAirport.entity_id,
        travel_date: travelDate,
        adults: pax,
      });
      setFlights(data.flights || []);
      setSessionId(data.session_id || '');
      setScreen('results');
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Could not fetch flights. Try again.';
      setErrorMessage(msg);
      setFlights([]); // Clear flights
      setScreen('results'); // Go to results screen to show the ListEmptyComponent with the error
    } finally { setLoading(false); }
  };

  const handleSelectFlight = async (f: Flight) => {
    setSelectedFlight(f);
    setLoading(true);
    try {
      // Create legs string for getFlightDetails
      const legsString = JSON.stringify([{ 
        origin: fromAirport?.sky_id, 
        destination: toAirport?.sky_id, 
        date: travelDate 
      }]);
      
      // Efficiently call getFlightDetails to verify the flight (will hit cache if repeated)
      await TravelAPI.getFlightDetails({
        itinerary_id: f.id,
        legs: legsString,
        session_id: sessionId,
        adults: pax,
        cabin_class: selectedClass.toLowerCase(),
      });
      
      setScreen('details');
    } catch (e) {
      console.warn("Flight Details error:", e);
      // Proceed anyway for the mockup experience
      setScreen('details');
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setScreen('home');
    setSelectedFlight(null);
    setFlights([]);
  };

  const handleRedirect = async () => {
    const q = encodeURIComponent(`${selectedFlight?.airline} ${selectedFlight?.origin_code} to ${selectedFlight?.dest_code} ${travelDate}`);
    const url = `https://www.google.com/travel/flights?q=${q}`;
    Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open browser.'));
  };

  // ── RENDER HELPERS ──
  const renderHeader = (title: string, sub?: string, onBack?: () => void) => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack || (() => navigation.goBack())}>
        <ArrowLeft size={20} color="#1C1C1E" />
      </TouchableOpacity>
      <View>
        <Text style={styles.headerTitle}>{title}</Text>
        {sub && <Text style={styles.headerSub}>{sub}</Text>}
      </View>
    </View>
  );

  if (screen === 'home') {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        {renderHeader('BODHI Travel', 'Book your next journey')}
        <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
          <View style={{ maxWidth: isTablet ? (isLandscape() ? 800 : 600) : '100%', alignSelf: 'center', width: '100%' }}>
          <View style={styles.searchCard}>
            <Text style={styles.cardTitle}>Find Flights</Text>
            
            {/* From */}
            <View style={styles.fieldRow}>
              <MapPin size={18} color={Colors.neonLime} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.fieldLabel}>FROM</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Origin City"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  value={fromQuery}
                  onChangeText={t => { setFromQuery(t); handleSearchAirports(t, 'from'); }}
                  onFocus={() => setFromFocused(true)}
                />
              </View>
            </View>
            {fromFocused && fromSuggestions.length > 0 && (
              <View style={styles.suggestions}>
                {fromSuggestions.map((a, i) => (
                  <TouchableOpacity key={i} style={styles.sugItem} onPress={() => { setFromAirport(a); setFromQuery(a.title); setFromSuggestions([]); setFromFocused(false); }}>
                    <Plane size={14} color={Colors.neonLime} />
                    <Text style={styles.sugText}>{a.title} ({a.sky_id})</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.divider} />

            {/* To */}
            <View style={styles.fieldRow}>
              <MapPin size={18} color="rgba(0,0,0,0.4)" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.fieldLabel}>TO</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Destination City"
                  placeholderTextColor="rgba(0,0,0,0.3)"
                  value={toQuery}
                  onChangeText={t => { setToQuery(t); handleSearchAirports(t, 'to'); }}
                  onFocus={() => setToFocused(true)}
                />
              </View>
            </View>
            {toFocused && toSuggestions.length > 0 && (
              <View style={styles.suggestions}>
                {toSuggestions.map((a, i) => (
                  <TouchableOpacity key={i} style={styles.sugItem} onPress={() => { setToAirport(a); setToQuery(a.title); setToSuggestions([]); setToFocused(false); }}>
                    <Plane size={14} color={Colors.neonLime} />
                    <Text style={styles.sugText}>{a.title} ({a.sky_id})</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.divider} />

            {/* Date & Pax */}
            <View style={{ flexDirection: 'row' }}>
              <View style={[styles.fieldRow, { flex: 1 }]}>
                <Calendar size={18} color="rgba(0,0,0,0.4)" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.fieldLabel}>DATE</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="2025-06-15"
                    placeholderTextColor="rgba(0,0,0,0.3)"
                    value={travelDate}
                    onChangeText={setTravelDate}
                  />
                </View>
              </View>
              <View style={[styles.fieldRow, { width: 100, marginLeft: 12 }]}>
                <Users size={18} color="rgba(0,0,0,0.4)" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.fieldLabel}>PAX</Text>
                  <View style={styles.paxWrap}>
                    <TouchableOpacity onPress={() => setPax(Math.max(1, pax - 1))}><Text style={styles.paxBtn}>−</Text></TouchableOpacity>
                    <Text style={styles.paxNum}>{pax}</Text>
                    <TouchableOpacity onPress={() => setPax(Math.min(9, pax + 1))}><Text style={styles.paxBtn}>+</Text></TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.searchBtn} activeOpacity={0.8} onPress={handleSearch} disabled={loading}>
              <LinearGradient colors={[Colors.neonLime, '#A3FF00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btnGrad}>
                {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Search Flights</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (screen === 'results') {
    return (
      <View style={styles.root}>
        {renderHeader(`${fromAirport?.sky_id} → ${toAirport?.sky_id}`, `${travelDate} · ${pax} Pax`, () => setScreen('home'))}
        <View style={{ flex: 1, maxWidth: isTablet ? (isLandscape() ? 900 : 700) : '100%', alignSelf: 'center', width: '100%' }}>
        <FlatList
          data={flights}
          keyExtractor={f => f.id}
          contentContainerStyle={{ padding: 20, flexGrow: 1 }}
          ListEmptyComponent={() => (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 }}>
              <Plane size={48} color="rgba(0,0,0,0.2)" style={{ marginBottom: 20 }} />
              <Text style={{ color: '#1C1C1E', fontSize: responsiveFont(18), fontWeight: '700', textAlign: 'center' }}>
                Cannot fetch flights
              </Text>
              <Text style={{ color: 'rgba(0,0,0,0.45)', textAlign: 'center', marginTop: 10, paddingHorizontal: 20 }}>
                {errorMessage || "Try changing your dates or selecting a different route."}
              </Text>
            </View>
          )}
          renderItem={({ item: f }) => (
            <TouchableOpacity style={styles.flightCard} onPress={() => handleSelectFlight(f)}>
              <View style={styles.fcTop}>
                <Text style={styles.airlineName}>{f.airline}</Text>
                <Text style={styles.flightPrice}>{f.price}</Text>
              </View>
              <View style={styles.fcRoute}>
                <View><Text style={styles.fcTime}>{formatTime(f.departure)}</Text><Text style={styles.fcCode}>{f.origin_code}</Text></View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.fcDur}>{formatDuration(f.duration_minutes)}</Text>
                  <View style={styles.fcLine}><View style={styles.fcDot} /><View style={styles.fcDash} /><View style={styles.fcDot} /></View>
                  <Text style={styles.fcStops}>{f.stops === 0 ? 'Non-stop' : `${f.stops} stop`}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}><Text style={styles.fcTime}>{formatTime(f.arrival)}</Text><Text style={styles.fcCode}>{f.dest_code}</Text></View>
              </View>
            </TouchableOpacity>
          )}
        />
        </View>
      </View>
    );
  }

  if (screen === 'details' && selectedFlight) {
    return (
      <View style={styles.root}>
        {renderHeader('Passenger Details', selectedFlight.airline, () => setScreen('results'))}
        <ScrollView style={styles.scrollView}>
          <View style={{ maxWidth: isTablet ? (isLandscape() ? 800 : 600) : '100%', alignSelf: 'center', width: '100%' }}>
          <View style={styles.formCard}>
            <Text style={styles.cardTitle}>Traveller Information</Text>
            <TextInput style={styles.formInput} placeholder="Full Name" placeholderTextColor="rgba(0,0,0,0.3)" value={passengerName} onChangeText={setPassengerName} />
            <TextInput 
              style={styles.formInput} 
              placeholder="Email" 
              placeholderTextColor="rgba(0,0,0,0.3)" 
              value={passengerEmail} 
              onChangeText={setPassengerEmail} 
              keyboardType="email-address" 
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput style={styles.formInput} placeholder="Phone" placeholderTextColor="rgba(0,0,0,0.3)" value={passengerPhone} onChangeText={setPassengerPhone} keyboardType="phone-pad" />
            
            <TouchableOpacity style={styles.searchBtn} activeOpacity={0.8} onPress={() => setScreen('confirm')}>
              <LinearGradient colors={[Colors.neonLime, '#A3FF00']} style={styles.btnGrad}>
                <Text style={styles.btnText}>Review & Book</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.confirmWrap, { maxWidth: isTablet ? (isLandscape() ? 800 : 600) : '100%', alignSelf: 'center', width: '100%' }]}>
        <CheckCircle size={64} color={Colors.neonLime} />
        <Text style={styles.confirmTitle}>Ready to Book!</Text>
        <Text style={styles.confirmSub}>{selectedFlight?.airline} · {selectedFlight?.price}</Text>
        <TouchableOpacity style={styles.searchBtn} onPress={handleRedirect}>
          <LinearGradient colors={['#C83232', '#a400a4']} style={styles.btnGrad}>
            <Text style={[styles.btnText, { color: '#1C1C1E' }]}>Complete on Airline Site</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={resetAll} style={{ marginTop: 20 }}><Text style={{ color: Colors.neonLime }}>← Search Again</Text></TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDFDF9' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 15 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyCenter: 'center', paddingTop: 10, paddingLeft: 10 },
  headerTitle: { color: '#1C1C1E', fontSize: responsiveFont(18), fontWeight: '800' },
  headerSub: { color: 'rgba(0,0,0,0.45)', fontSize: responsiveFont(12) },
  scrollView: { flex: 1, paddingHorizontal: 20 },
  searchCard: { backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  cardTitle: { color: '#1C1C1E', fontSize: responsiveFont(18), fontWeight: '800', marginBottom: 20 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  fieldLabel: { color: 'rgba(0,0,0,0.3)', fontSize: responsiveFont(10), fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  fieldInput: { color: '#1C1C1E', fontSize: responsiveFont(16), fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginLeft: 30 },
  suggestions: { backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 12, marginTop: 4, marginLeft: 30 },
  sugItem: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  sugText: { color: '#1C1C1E', fontSize: responsiveFont(14) },
  paxWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  paxBtn: { color: Colors.neonLime, fontSize: responsiveFont(20), fontWeight: '800' },
  paxNum: { color: '#1C1C1E', fontSize: responsiveFont(16), fontWeight: '700' },
  searchBtn: { marginTop: 24, borderRadius: 16, overflow: 'hidden' },
  btnGrad: { height: 56, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  btnText: { color: '#FFF', fontSize: responsiveFont(16), fontWeight: '800' },
  flightCard: { backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 20, padding: 20, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  fcTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  airlineName: { color: '#1C1C1E', fontSize: responsiveFont(14), fontWeight: '700' },
  flightPrice: { color: Colors.neonLime, fontSize: responsiveFont(18), fontWeight: '800' },
  fcRoute: { flexDirection: 'row', alignItems: 'center' },
  fcTime: { color: '#1C1C1E', fontSize: responsiveFont(18), fontWeight: '800' },
  fcCode: { color: 'rgba(0,0,0,0.4)', fontSize: responsiveFont(12), marginTop: 2 },
  fcDur: { color: 'rgba(0,0,0,0.45)', fontSize: responsiveFont(11) },
  fcLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginVertical: 5 },
  fcDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.neonLime },
  fcDash: { width: 40, height: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  fcStops: { color: 'rgba(0,0,0,0.3)', fontSize: responsiveFont(10) },
  formCard: { backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 24, padding: 20 },
  formInput: { backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 15, color: '#1C1C1E', marginBottom: 15 },
  confirmWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  confirmTitle: { color: '#1C1C1E', fontSize: responsiveFont(24), fontWeight: '800', marginTop: 20 },
  confirmSub: { color: 'rgba(0,0,0,0.45)', fontSize: responsiveFont(14), textAlign: 'center', marginTop: 10 },
});

export default TravelBookingScreen;